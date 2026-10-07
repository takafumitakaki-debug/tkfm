from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sns_autopilot.instagram import InstagramError
from sns_autopilot.posts import load_posts
from sns_autopilot.publisher import MAX_ATTEMPTS, publish_due
from sns_autopilot.state import State

TZ = ZoneInfo("Asia/Tokyo")
NOW = datetime(2026, 10, 20, 12, 0, tzinfo=TZ)


def post_yaml(post_id, status="approved", when="2026-10-20T11:30:00+09:00", platforms="[instagram, line]"):
    return f"""id: {post_id}
status: {status}
scheduled_at: {when}
platforms: {platforms}
images: [https://example.com/a.jpg]
caption: {{instagram: IG本文, line: LINE本文}}
"""


class FakeIG:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def publish(self, images, caption):
        self.calls.append((images, caption))
        if self.fail:
            raise InstagramError("boom")
        return {"media_id": f"M{len(self.calls)}", "permalink": None}


class FakeLine:
    def __init__(self):
        self.calls = []

    def broadcast(self, post_id, text, images):
        self.calls.append((post_id, text, images))
        return {"request_id": "R1"}


def run(write_post, tmp_path, ig, line, now=NOW, **kw):
    posts = load_posts(write_post.dir, TZ)
    state = State(tmp_path / "state.json")
    summary = publish_due(posts, state, now, ig, line, log=lambda *_: None, **kw)
    return summary, state


def test_publishes_only_due_approved_posts(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due"))
    write_post("future.yaml", post_yaml("future", when="2026-10-21T09:00:00+09:00"))
    write_post("draft.yaml", post_yaml("draft", status="draft"))
    ig, line = FakeIG(), FakeLine()
    summary, state = run(write_post, tmp_path, ig, line)
    assert summary.published == ["due/instagram", "due/line"]
    assert len(ig.calls) == 1 and len(line.calls) == 1
    assert state.published("due", "instagram")["media_id"] == "M1"


def test_second_run_does_not_repost(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due"))
    ig, line = FakeIG(), FakeLine()
    run(write_post, tmp_path, ig, line)
    summary, _ = run(write_post, tmp_path, ig, line)
    assert summary.published == []
    assert len(ig.calls) == 1 and len(line.calls) == 1


def test_partial_failure_retries_only_failed_platform(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due"))
    line = FakeLine()
    summary, state = run(write_post, tmp_path, FakeIG(fail=True), line)
    assert summary.failed == ["due/instagram"] and summary.published == ["due/line"]
    assert state.attempts("due", "instagram") == 1

    ig = FakeIG()
    summary, state = run(write_post, tmp_path, ig, line)
    assert summary.published == ["due/instagram"]
    assert len(line.calls) == 1  # LINE は再送しない
    assert "errors" not in state.entry("due")


def test_stops_after_max_attempts(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due", platforms="[instagram]"))
    ig = FakeIG(fail=True)
    for _ in range(MAX_ATTEMPTS + 2):
        run(write_post, tmp_path, ig, None)
    assert len(ig.calls) == MAX_ATTEMPTS


def test_stale_post_is_not_published(write_post, tmp_path):
    write_post("old.yaml", post_yaml("old", when="2026-10-18T11:30:00+09:00"))
    ig, line = FakeIG(), FakeLine()
    summary, _ = run(write_post, tmp_path, ig, line, max_delay=timedelta(hours=24))
    assert summary.published == [] and len(summary.skipped) == 2
    assert ig.calls == []


def test_missing_credentials_is_failure(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due", platforms="[line]"))
    summary, state = run(write_post, tmp_path, None, None)
    assert summary.failed == ["due/line"]
    assert state.attempts("due", "line") == 0  # 設定漏れは失敗回数に数えない


def test_dry_run_does_not_call_or_record(write_post, tmp_path):
    write_post("due.yaml", post_yaml("due"))
    ig, line = FakeIG(), FakeLine()
    summary, state = run(write_post, tmp_path, ig, line, dry_run=True)
    assert summary.published == ["due/instagram", "due/line"]
    assert ig.calls == [] and state.published("due", "instagram") is None
