from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from sns_autopilot.caption import CaptionGenerationError, CaptionGenerator, GeneratedCaptions, find_ng_words
from sns_autopilot.posts import load_posts
from sns_autopilot.report import PostRow, render

TZ = ZoneInfo("Asia/Tokyo")
BRAND = {"name": "テスト店", "fixed_hashtags": ["#テスト店"], "ng_words": ["絶対"]}


class FakeClient:
    def __init__(self, response):
        self.kwargs = None
        outer = self

        class Messages:
            def parse(self, **kwargs):
                outer.kwargs = kwargs
                return response

        self.beta = SimpleNamespace(messages=Messages())


def draft(write_post):
    write_post(
        "d.yaml",
        """id: d
status: draft
scheduled_at: 2026-10-20T11:30:00+09:00
platforms: [instagram, line]
brief: 秋の新メニュー。1,200円
images: [https://example.com/a.jpg]
""",
    )
    return load_posts(write_post.dir, TZ)[0]


def test_generate_builds_request_and_merges_hashtags(write_post):
    parsed = GeneratedCaptions(instagram="IG", line="LINE", hashtags=["秋", "#テスト店", "#ランチ"], review_notes="")
    client = FakeClient(SimpleNamespace(stop_reason="end_turn", parsed_output=parsed))
    gen = CaptionGenerator(BRAND, "claude-opus-5-5", client=client)
    out = gen.generate(draft(write_post), datetime(2026, 10, 7, tzinfo=TZ))

    assert out.hashtags == ["#テスト店", "#秋", "#ランチ"]
    kw = client.kwargs
    assert kw["model"] == "claude-opus-5-5"
    assert kw["output_format"] is GeneratedCaptions
    assert kw["fallbacks"] == "default"
    assert "秋の新メニュー" in kw["messages"][0]["content"]
    assert "テスト店" in kw["system"] and "絶対" in kw["system"]


def test_generate_refusal_raises(write_post):
    client = FakeClient(SimpleNamespace(stop_reason="refusal", parsed_output=None))
    gen = CaptionGenerator(BRAND, "claude-opus-5-5", client=client)
    with pytest.raises(CaptionGenerationError, match="断りました"):
        gen.generate(draft(write_post), datetime(2026, 10, 7, tzinfo=TZ))


def test_find_ng_words():
    assert find_ng_words("絶対おいしい", BRAND) == ["絶対"]
    assert find_ng_words("おいしい", BRAND) == []


def test_render_report():
    rows = [
        PostRow("a", "instagram", datetime(2026, 10, 1, tzinfo=TZ), {"reach": 200, "likes": 20, "comments": 2, "saved": 5, "shares": 1}, link="https://ig/p/a"),
        PostRow("b", "instagram", datetime(2026, 10, 2, tzinfo=TZ), {"reach": 500, "total_interactions": 50}),
        PostRow("c", "line", datetime(2026, 10, 3, tzinfo=TZ), {"delivered": 1000, "uniqueImpression": 600, "uniqueClick": 30}),
    ]
    account = {
        "instagram": {"username": "test", "followers_count": 1234, "media_count": 10},
        "line": {"date": "2026-10-06", "status": "ready", "followers": 800, "targetedReaches": 700, "blocks": 20},
    }
    text = render(rows, account, datetime(2026, 9, 30).date(), datetime(2026, 10, 6).date(), datetime(2026, 10, 7, 9, tzinfo=TZ))
    assert "フォロワー 1,234" in text
    assert "[a](https://ig/p/a)" in text
    assert "14.0%" in text  # (20+2+5+1)/200
    assert "10.0%" in text  # 50/500
    assert "リーチ最多: **b**" in text
    assert "60.0%" in text  # LINE 開封率
