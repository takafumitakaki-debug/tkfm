"""予約投稿の実行。approved かつ予定時刻を過ぎた投稿を、未投稿のプラットフォームにだけ出す。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .instagram import InstagramClient, InstagramError
from .line import LineClient, LineError
from .posts import Post
from .state import State

MAX_ATTEMPTS = 3


@dataclass
class PublishSummary:
    published: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failed


def due_targets(
    posts: list[Post], state: State, now: datetime, max_delay: timedelta
) -> tuple[list[tuple[Post, str]], list[str]]:
    """今回投稿すべき (投稿, プラットフォーム) と、見送った理由の一覧を返す。"""
    targets: list[tuple[Post, str]] = []
    skipped: list[str] = []
    for post in posts:
        if post.status != "approved" or post.scheduled_at is None or post.scheduled_at > now:
            continue
        pending = [p for p in post.platforms if not state.published(post.id, p)]
        if not pending:
            continue
        if post.errors:
            skipped.append(f"{post.id}: 入力エラーのため投稿しません（{'; '.join(post.errors)}）")
            continue
        for platform in pending:
            attempts = state.attempts(post.id, platform)
            if attempts >= MAX_ATTEMPTS:
                skipped.append(f"{post.id}/{platform}: {attempts}回失敗したため停止中（state.json の errors を消すと再試行）")
            elif now - post.scheduled_at > max_delay and attempts == 0:
                skipped.append(
                    f"{post.id}/{platform}: 予定時刻 {post.scheduled_at:%Y-%m-%d %H:%M} から"
                    f"{max_delay}以上経過しているため投稿しません（出す場合は scheduled_at を更新）"
                )
            else:
                targets.append((post, platform))
    return targets, skipped


def publish_due(
    posts: list[Post],
    state: State,
    now: datetime,
    instagram: InstagramClient | None,
    line: LineClient | None,
    max_delay: timedelta = timedelta(hours=24),
    dry_run: bool = False,
    log=print,
) -> PublishSummary:
    summary = PublishSummary()
    targets, summary.skipped = due_targets(posts, state, now, max_delay)
    for msg in summary.skipped:
        log(f"[skip] {msg}")
    if not targets:
        log("投稿対象はありません")

    for post, platform in targets:
        label = f"{post.id}/{platform}"
        if dry_run:
            log(f"[dry-run] {label} を投稿予定")
            summary.published.append(label)
            continue
        missing = _missing_credentials(platform, instagram, line)
        if missing:
            # 設定漏れは投稿内容の問題ではないので、失敗回数には数えない
            summary.failed.append(label)
            log(f"[fail] {label}: {missing} が未設定")
            continue
        try:
            if platform == "instagram":
                result = instagram.publish(post.images, post.instagram_caption())
            elif platform == "line":
                result = line.broadcast(post.id, post.line_text(), post.images)
            else:
                raise ValueError(f"未対応の platform: {platform}")
        except (InstagramError, LineError, ValueError) as e:
            state.record_error(post.id, platform, str(e))
            summary.failed.append(label)
            log(f"[fail] {label}: {e}")
            continue
        state.record_success(post.id, platform, result)
        summary.published.append(label)
        log(f"[ok] {label}: {result}")
    return summary


def _missing_credentials(platform: str, instagram, line) -> str | None:
    if platform == "instagram" and instagram is None:
        return "IG_USER_ID / IG_ACCESS_TOKEN"
    if platform == "line" and line is None:
        return "LINE_CHANNEL_ACCESS_TOKEN"
    return None
