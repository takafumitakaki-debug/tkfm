from datetime import datetime
from zoneinfo import ZoneInfo

from sns_autopilot.posts import load_posts, write_generated_captions

TZ = ZoneInfo("Asia/Tokyo")


def test_valid_post_and_naive_datetime_uses_timezone(write_post):
    write_post(
        "a.yaml",
        """id: a
status: approved
scheduled_at: "2026-10-20 11:30"
platforms: [instagram, line]
images: [https://example.com/a.jpg]
caption:
  instagram: こんにちは
  line: お知らせ
hashtags: [秋, "#ランチ"]
""",
    )
    [post] = load_posts(write_post.dir, TZ)
    assert post.errors == []
    assert post.scheduled_at == datetime(2026, 10, 20, 11, 30, tzinfo=TZ)
    assert post.instagram_caption() == "こんにちは\n\n#秋 #ランチ"


def test_validation_errors(write_post):
    write_post(
        "b.yaml",
        """id: b
status: approved
scheduled_at: 2026-10-20T11:30:00+09:00
platforms: [instagram, x]
images: [http://insecure.example.com/a.jpg]
caption: {instagram: ""}
""",
    )
    [post] = load_posts(write_post.dir, TZ)
    joined = "\n".join(post.errors)
    assert "未対応の platform" in joined
    assert "https" in joined
    assert "本文が空" in joined


def test_instagram_requires_image_and_limits_hashtags(write_post):
    tags = ", ".join(f"t{i}" for i in range(31))
    write_post(
        "c.yaml",
        f"""id: c
status: draft
platforms: [instagram]
caption: {{instagram: hi}}
hashtags: [{tags}]
""",
    )
    [post] = load_posts(write_post.dir, TZ)
    joined = "\n".join(post.errors)
    assert "画像が1枚以上必要" in joined
    assert "最大30個" in joined


def test_duplicate_ids_and_underscore_files_skipped(write_post):
    body = "id: same\nstatus: draft\nplatforms: [line]\nbrief: x\n"
    write_post("one.yaml", body)
    write_post("two.yaml", body)
    write_post("_example.yaml", body)
    posts = load_posts(write_post.dir, TZ)
    assert len(posts) == 2
    assert any("重複" in e for e in posts[1].errors)


def test_write_generated_captions_keeps_comments(write_post):
    path = write_post(
        "d.yaml",
        """# 先頭コメント
id: d
status: draft  # 承認したら approved
platforms: [instagram, line]
brief: 新メニュー
images: [https://example.com/a.jpg]
caption:
  instagram: ""
  line: ""
""",
    )
    write_generated_captions(path, {"instagram": "本文\n2行目", "line": "LINE本文"}, ["#a", "#b"])
    text = path.read_text(encoding="utf-8")
    assert "# 先頭コメント" in text
    assert "# 承認したら approved" in text
    [post] = load_posts(write_post.dir, TZ)
    assert post.captions == {"instagram": "本文\n2行目", "line": "LINE本文"}
    assert post.hashtags == ["#a", "#b"]
    assert post.errors == []
