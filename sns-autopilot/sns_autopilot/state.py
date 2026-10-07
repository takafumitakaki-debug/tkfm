"""投稿結果の記録（state/state.json）。

二重投稿を防ぐ要。プラットフォームごとに結果を持つので、
Instagram は成功・LINE は失敗、のような場合は次回 LINE だけ再試行される。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


class State:
    def __init__(self, path: Path):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.data = {"posts": {}}

    def entry(self, post_id: str) -> dict:
        return self.data["posts"].setdefault(post_id, {})

    def published(self, post_id: str, platform: str) -> dict | None:
        return self.data["posts"].get(post_id, {}).get(platform)

    def record_success(self, post_id: str, platform: str, result: dict) -> None:
        entry = self.entry(post_id)
        entry[platform] = {**result, "published_at": _now()}
        entry.get("errors", {}).pop(platform, None)
        if not entry.get("errors"):
            entry.pop("errors", None)
        self.save()

    def record_error(self, post_id: str, platform: str, message: str) -> None:
        errors = self.entry(post_id).setdefault("errors", {})
        prev = errors.get(platform, {})
        errors[platform] = {
            "message": message[:1000],
            "attempts": prev.get("attempts", 0) + 1,
            "last_attempt_at": _now(),
        }
        self.save()

    def attempts(self, post_id: str, platform: str) -> int:
        return self.data["posts"].get(post_id, {}).get("errors", {}).get(platform, {}).get("attempts", 0)

    def save(self) -> None:
        # 1件ごとに即保存する。途中で落ちても成功済みの投稿は記録が残る。
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        tmp.replace(self.path)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
