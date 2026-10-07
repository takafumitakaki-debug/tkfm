"""Claude API による投稿文の生成。

brief（投稿の元ネタ）と brand.yaml（トーン・NGワード等）から、
Instagram キャプション・LINE 配信文・ハッシュタグを構造化出力で受け取る。
生成結果は下書きとして書き戻すだけで、公開には人の承認（status: approved）が必要。
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field
from ruamel.yaml import YAML

from .posts import IG_HASHTAG_MAX, Post


class GeneratedCaptions(BaseModel):
    instagram: str = Field(description="Instagram キャプション本文（ハッシュタグは含めない）")
    line: str = Field(description="LINE 公式アカウントの一斉配信テキスト")
    hashtags: list[str] = Field(description="Instagram 用ハッシュタグ（# 付き）")
    review_notes: str = Field(description="承認者への申し送り（事実確認が必要な点など）。なければ空文字")


class CaptionGenerationError(RuntimeError):
    pass


def load_brand(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return YAML(typ="safe").load(f) or {}


def build_system_prompt(brand: dict) -> str:
    def lines(key: str) -> str:
        items = brand.get(key) or []
        return "\n".join(f"- {x}" for x in items) if items else "- （指定なし）"

    return f"""あなたは「{brand.get('name', '（アカウント名未設定）')}」の SNS 運用担当です。
担当者が書いた投稿メモ（brief）をもとに、Instagram と LINE 公式アカウントの投稿文を作成します。

# アカウント情報
- 概要: {brand.get('description', '（未設定）')}
- 主な読者: {brand.get('audience', '（未設定）')}
- トーン: {brand.get('tone', '親しみやすく丁寧')}

# 文章ルール
{lines('rules')}

# 使ってはいけない言葉・表現
{lines('ng_words')}

# Instagram の書き方
- 冒頭1〜2行で内容が伝わるようにする（フィードでは続きが折りたたまれるため）
- 改行で読みやすく区切る。本文は 2,200 文字を大きく下回る長さにする
- 絵文字: {brand.get('emoji', '控えめに使う')}
- ハッシュタグは本文に入れず hashtags に分ける。brief に合うものを最大 {brand.get('max_hashtags', 10)} 個
- 必ず含めるハッシュタグ: {', '.join(brand.get('fixed_hashtags') or []) or 'なし'}
- 締めの導線: {brand.get('instagram_cta', 'なし')}

# LINE の書き方
- 友だちに届くプッシュ通知として読まれる。冒頭で用件が分かるようにし、Instagram より短く簡潔に
- ハッシュタグは使わない
- 締めの導線: {brand.get('line_cta', 'なし')}

# 事実の扱い
brief に書かれていない日付・価格・数量・固有名詞を作らないこと。
必要なのに brief にない情報は本文に【要確認：〇〇】と書き、review_notes にも挙げる。"""


def build_user_prompt(post: Post, now: datetime) -> str:
    when = post.scheduled_at.strftime("%Y-%m-%d %H:%M") if post.scheduled_at else "未定"
    return f"""以下の投稿を作成してください。

- 投稿予定日時: {when}（本日: {now.strftime('%Y-%m-%d')}）
- 投稿先: {', '.join(post.platforms)}
- 添付画像の枚数: {len(post.images)}

<brief>
{post.brief.strip()}
</brief>"""


class CaptionGenerator:
    def __init__(self, brand: dict, model: str, client: anthropic.Anthropic | None = None):
        self.brand = brand
        self.model = model
        self.client = client or anthropic.Anthropic()
        self.system = build_system_prompt(brand)

    def generate(self, post: Post, now: datetime) -> GeneratedCaptions:
        try:
            response = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=16000,
                # 安全分類器で断られた場合はサーバー側で推奨モデルに自動で切り替える
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={"effort": "medium"},
                system=self.system,
                messages=[{"role": "user", "content": build_user_prompt(post, now)}],
                output_format=GeneratedCaptions,
            )
        except anthropic.APIConnectionError as e:
            raise CaptionGenerationError(f"Claude API に接続できません: {e}") from e
        except anthropic.RateLimitError as e:
            raise CaptionGenerationError("Claude API のレート制限に達しました。時間をおいて再実行してください") from e
        except anthropic.APIStatusError as e:
            raise CaptionGenerationError(f"Claude API エラー ({e.status_code}): {e.message}") from e

        if response.stop_reason == "refusal":
            raise CaptionGenerationError("Claude が生成を断りました。brief の内容を見直してください")
        if response.stop_reason == "max_tokens" or response.parsed_output is None:
            raise CaptionGenerationError(f"生成結果を読み取れませんでした（stop_reason={response.stop_reason}）")
        return self._postprocess(response.parsed_output)

    def _postprocess(self, out: GeneratedCaptions) -> GeneratedCaptions:
        tags: list[str] = []
        for tag in [*(self.brand.get("fixed_hashtags") or []), *out.hashtags]:
            tag = tag.strip().replace(" ", "")
            if not tag:
                continue
            tag = tag if tag.startswith("#") else f"#{tag}"
            if tag not in tags:
                tags.append(tag)
        out.hashtags = tags[:IG_HASHTAG_MAX]
        return out


def find_ng_words(text: str, brand: dict) -> list[str]:
    return [w for w in (brand.get("ng_words") or []) if w and w in text]
