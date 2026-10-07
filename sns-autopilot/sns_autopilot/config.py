"""環境変数とパスの設定。秘密情報はすべて環境変数（GitHub Actions では Secrets）から読む。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    posts_dir: Path
    state_file: Path
    reports_dir: Path
    brand_file: Path
    timezone: ZoneInfo

    # Instagram（Meta Graph API）
    ig_user_id: str | None
    ig_access_token: str | None
    graph_api_version: str

    # LINE Messaging API
    line_channel_access_token: str | None

    # Claude API（ANTHROPIC_API_KEY は SDK が直接読む）
    claude_model: str


def load_settings() -> Settings:
    def path(name: str, default: str) -> Path:
        return Path(os.environ.get(name, ROOT / default))

    return Settings(
        posts_dir=path("SNS_POSTS_DIR", "posts"),
        state_file=path("SNS_STATE_FILE", "state/state.json"),
        reports_dir=path("SNS_REPORTS_DIR", "reports"),
        brand_file=path("SNS_BRAND_FILE", "brand.yaml"),
        timezone=ZoneInfo(os.environ.get("SNS_TIMEZONE", "Asia/Tokyo")),
        ig_user_id=os.environ.get("IG_USER_ID") or None,
        ig_access_token=os.environ.get("IG_ACCESS_TOKEN") or None,
        graph_api_version=os.environ.get("GRAPH_API_VERSION", "v23.0"),
        line_channel_access_token=os.environ.get("LINE_CHANNEL_ACCESS_TOKEN") or None,
        claude_model=os.environ.get("CLAUDE_MODEL", "claude-opus-5-5"),
    )
