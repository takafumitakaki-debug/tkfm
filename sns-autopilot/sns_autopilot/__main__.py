"""CLI: python -m sns_autopilot {list,validate,generate,publish,report}"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

from .config import Settings, load_settings
from .posts import load_posts, write_generated_captions
from .state import State


def _clients(settings: Settings):
    from .instagram import InstagramClient
    from .line import LineClient

    instagram = (
        InstagramClient(settings.ig_user_id, settings.ig_access_token, settings.graph_api_version)
        if settings.ig_user_id and settings.ig_access_token
        else None
    )
    line = LineClient(settings.line_channel_access_token) if settings.line_channel_access_token else None
    return instagram, line


def _now(settings: Settings, override: str | None) -> datetime:
    if override:
        dt = datetime.fromisoformat(override)
        return dt if dt.tzinfo else dt.replace(tzinfo=settings.timezone)
    return datetime.now(settings.timezone)


def cmd_list(settings: Settings, args) -> int:
    state = State(settings.state_file)
    for post in load_posts(settings.posts_dir, settings.timezone):
        done = [p for p in post.platforms if state.published(post.id, p)]
        if done and len(done) == len(post.platforms):
            status = "published"
        elif done:
            status = f"partial({','.join(done)})"
        else:
            status = post.status
        when = f"{post.scheduled_at:%Y-%m-%d %H:%M}" if post.scheduled_at else "日時未定"
        mark = " ⚠" if post.errors else ""
        print(f"{when}  {status:<18} {','.join(post.platforms):<15} {post.id}{mark}")
    return 0


def cmd_validate(settings: Settings, args) -> int:
    posts = load_posts(settings.posts_dir, settings.timezone)
    bad = [p for p in posts if p.errors]
    for post in bad:
        print(f"✗ {post.path.name}")
        for err in post.errors:
            print(f"    - {err}")
    print(f"{len(posts)}件中 {len(bad)}件にエラー")
    return 1 if bad else 0


def cmd_generate(settings: Settings, args) -> int:
    from .caption import CaptionGenerationError, CaptionGenerator, find_ng_words, load_brand

    posts = load_posts(settings.posts_dir, settings.timezone)
    targets = [
        p
        for p in posts
        if p.status == "draft"
        and p.brief.strip()
        and (not args.id or p.id in args.id)
        and (args.force or p.missing_captions())
    ]
    if not targets:
        print("生成対象の下書きはありません（status: draft・brief あり・本文が空の投稿が対象）")
        return 0

    brand = load_brand(settings.brand_file)
    generator = CaptionGenerator(brand, settings.claude_model)
    now = _now(settings, None)
    notes: list[str] = []
    failed = 0
    for post in targets:
        try:
            out = generator.generate(post, now)
        except CaptionGenerationError as e:
            print(f"[fail] {post.id}: {e}")
            failed += 1
            continue
        platforms = post.platforms if args.force else post.missing_captions()
        captions = {p: getattr(out, p) for p in platforms}
        hashtags = out.hashtags if "instagram" in platforms else None
        write_generated_captions(post.path, captions, hashtags)

        warnings = []
        ng = find_ng_words(" ".join(captions.values()), brand)
        if ng:
            warnings.append(f"NGワードを含む: {', '.join(ng)}")
        if "【要確認" in " ".join(captions.values()):
            warnings.append("本文に【要確認】があります")
        line = f"- **{post.id}**（{', '.join(platforms)}）"
        if out.review_notes.strip():
            line += f"\n  - 申し送り: {out.review_notes.strip()}"
        for w in warnings:
            line += f"\n  - ⚠ {w}"
        notes.append(line)
        print(f"[ok] {post.id}: {', '.join(platforms)} の本文を生成")

    if args.notes_file and notes:
        Path(args.notes_file).write_text("\n".join(notes) + "\n", encoding="utf-8")
    print("\n".join(notes))
    return 1 if failed else 0


def cmd_publish(settings: Settings, args) -> int:
    from .publisher import publish_due

    posts = load_posts(settings.posts_dir, settings.timezone)
    state = State(settings.state_file)
    instagram, line = _clients(settings)
    summary = publish_due(
        posts,
        state,
        _now(settings, args.now),
        instagram,
        line,
        max_delay=timedelta(hours=args.max_delay_hours),
        dry_run=args.dry_run,
    )
    print(f"投稿 {len(summary.published)}件 / 失敗 {len(summary.failed)}件 / 見送り {len(summary.skipped)}件")
    return 0 if summary.ok else 1


def cmd_report(settings: Settings, args) -> int:
    from .report import collect, render

    now = _now(settings, args.now)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=args.days)
    posts = load_posts(settings.posts_dir, settings.timezone)
    state = State(settings.state_file)
    instagram, line = _clients(settings)
    rows, account = collect(posts, state, start, end, instagram, line)
    text = render(rows, account, start.date(), (end - timedelta(days=1)).date(), now)

    out = Path(args.output) if args.output else settings.reports_dir / f"{end:%Y-%m-%d}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"→ {out}", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sns_autopilot", description="Instagram / LINE 自動運用ツール")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="投稿キューの一覧")
    sub.add_parser("validate", help="投稿ファイルの検証")

    g = sub.add_parser("generate", help="下書きの本文を Claude で生成")
    g.add_argument("--id", action="append", help="対象の投稿ID（複数指定可）")
    g.add_argument("--force", action="store_true", help="本文が入っていても作り直す")
    g.add_argument("--notes-file", help="承認者向けの申し送りを書き出すファイル")

    p = sub.add_parser("publish", help="予定時刻を過ぎた承認済み投稿を公開")
    p.add_argument("--dry-run", action="store_true", help="実際には投稿しない")
    p.add_argument("--now", help="現在時刻を上書き（テスト用, ISO 8601）")
    p.add_argument("--max-delay-hours", type=float, default=24, help="予定時刻からこれ以上遅れた投稿は出さない")

    r = sub.add_parser("report", help="分析レポートを作成")
    r.add_argument("--days", type=int, default=7, help="集計日数（前日までの N 日間）")
    r.add_argument("--output", help="出力先（既定: reports/YYYY-MM-DD.md）")
    r.add_argument("--now", help="現在時刻を上書き（テスト用, ISO 8601）")

    args = parser.parse_args(argv)
    settings = load_settings()
    handler = {
        "list": cmd_list,
        "validate": cmd_validate,
        "generate": cmd_generate,
        "publish": cmd_publish,
        "report": cmd_report,
    }[args.command]
    return handler(settings, args)


if __name__ == "__main__":
    sys.exit(main())
