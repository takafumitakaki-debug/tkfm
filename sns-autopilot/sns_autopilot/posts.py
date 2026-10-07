"""投稿キュー（posts/*.yaml）の読み書きとバリデーション。

投稿ファイルは人が書く。ツールが書き換えるのは `generate` でのキャプション欄だけで、
コメントや並び順を壊さないよう ruamel.yaml の round-trip モードで保存する。
投稿結果は posts/ ではなく state/state.json に記録する（state.py）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from ruamel.yaml import YAML

PLATFORMS = ("instagram", "line")
STATUSES = ("draft", "approved")

IG_CAPTION_MAX = 2200
IG_HASHTAG_MAX = 30
IG_IMAGES_MAX = 10
LINE_TEXT_MAX = 5000
LINE_IMAGES_MAX = 4  # 1配信あたり最大5メッセージ = テキスト1 + 画像4

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")

_yaml = YAML()  # round-trip（コメント保持）
_yaml.preserve_quotes = True
_yaml.width = 4096
_yaml.allow_unicode = True


@dataclass
class Post:
    path: Path
    id: str
    status: str
    scheduled_at: datetime | None
    platforms: list[str]
    brief: str
    images: list[str]
    captions: dict[str, str]
    hashtags: list[str]
    errors: list[str] = field(default_factory=list)

    def instagram_caption(self) -> str:
        body = self.captions.get("instagram", "").strip()
        tags = " ".join(_normalize_tag(t) for t in self.hashtags if t.strip())
        return f"{body}\n\n{tags}".strip() if tags else body

    def line_text(self) -> str:
        return self.captions.get("line", "").strip()

    def missing_captions(self) -> list[str]:
        return [p for p in self.platforms if not self.captions.get(p, "").strip()]


def _normalize_tag(tag: str) -> str:
    tag = tag.strip().replace(" ", "")
    return tag if tag.startswith("#") else f"#{tag}"


def _parse_datetime(value, tz: ZoneInfo) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).strip())
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt


def load_post(path: Path, tz: ZoneInfo) -> Post:
    with path.open(encoding="utf-8") as f:
        data = _yaml.load(f) or {}

    errors: list[str] = []
    post_id = str(data.get("id") or path.stem)
    if not _ID_RE.match(post_id):
        errors.append(f"id は英数字・ハイフン・アンダースコアのみ: {post_id!r}")

    status = str(data.get("status", "draft"))
    if status not in STATUSES:
        errors.append(f"status は {'/'.join(STATUSES)} のいずれか: {status!r}")

    scheduled_at = None
    if data.get("scheduled_at") is not None:
        try:
            scheduled_at = _parse_datetime(data["scheduled_at"], tz)
        except ValueError:
            errors.append(f"scheduled_at が日時として読めない: {data['scheduled_at']!r}")
    elif status == "approved":
        errors.append("approved の投稿には scheduled_at が必要")

    platforms = [str(p) for p in (data.get("platforms") or [])]
    if not platforms:
        errors.append("platforms が空")
    for p in platforms:
        if p not in PLATFORMS:
            errors.append(f"未対応の platform: {p!r}")

    captions_raw = data.get("caption") or {}
    captions = {k: str(v or "") for k, v in captions_raw.items()}
    hashtags = [str(t) for t in (data.get("hashtags") or [])]
    images = [str(u) for u in (data.get("images") or [])]

    post = Post(
        path=path,
        id=post_id,
        status=status,
        scheduled_at=scheduled_at,
        platforms=platforms,
        brief=str(data.get("brief") or ""),
        images=images,
        captions=captions,
        hashtags=hashtags,
        errors=errors,
    )
    post.errors.extend(_validate_content(post))
    return post


def _validate_content(post: Post) -> list[str]:
    errors: list[str] = []
    for url in post.images:
        if not url.startswith("https://"):
            errors.append(f"画像は https の公開URLのみ（各SNSのサーバーが取得するため）: {url}")

    if "instagram" in post.platforms:
        if not post.images:
            errors.append("Instagram は画像が1枚以上必要")
        if len(post.images) > IG_IMAGES_MAX:
            errors.append(f"Instagram の画像は最大{IG_IMAGES_MAX}枚")
        if len(post.instagram_caption()) > IG_CAPTION_MAX:
            errors.append(f"Instagram キャプションが{IG_CAPTION_MAX}文字を超過")
        tag_count = len(re.findall(r"#\S+", post.instagram_caption()))
        if tag_count > IG_HASHTAG_MAX:
            errors.append(f"Instagram のハッシュタグは最大{IG_HASHTAG_MAX}個（現在{tag_count}個）")

    if "line" in post.platforms:
        if len(post.line_text()) > LINE_TEXT_MAX:
            errors.append(f"LINE 本文が{LINE_TEXT_MAX}文字を超過")
        if len(post.images) > LINE_IMAGES_MAX:
            errors.append(f"LINE で送れる画像は最大{LINE_IMAGES_MAX}枚")

    if post.status == "approved" and post.missing_captions():
        errors.append(f"approved なのに本文が空: {', '.join(post.missing_captions())}")
    if post.status == "draft" and post.missing_captions() and not post.brief.strip():
        errors.append("本文が空の場合は brief（AI生成の元ネタ）を書く")
    return errors


def load_posts(posts_dir: Path, tz: ZoneInfo) -> list[Post]:
    # 先頭が _ のファイル（サンプル等）は対象外
    files = [p for p in sorted(posts_dir.glob("*.y*ml")) if not p.name.startswith("_")]
    posts = [load_post(p, tz) for p in files]
    seen: dict[str, Path] = {}
    for post in posts:
        if post.id in seen:
            post.errors.append(f"id が {seen[post.id].name} と重複")
        seen.setdefault(post.id, post.path)
    return posts


def write_generated_captions(path: Path, captions: dict[str, str], hashtags: list[str] | None) -> None:
    """キャプション欄だけを書き換えて保存する（コメント・他の項目はそのまま）。"""
    with path.open(encoding="utf-8") as f:
        data = _yaml.load(f)
    if data.get("caption") is None:
        data["caption"] = {}
    for platform, text in captions.items():
        data["caption"][platform] = text
    if hashtags is not None:
        data["hashtags"] = hashtags
    with path.open("w", encoding="utf-8") as f:
        _yaml.dump(data, f)
