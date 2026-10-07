"""分析レポート（Markdown）の作成。

対象期間に投稿したものの反応と、アカウント全体の数字をまとめる。
数字は取得時点の累計なので、同じ投稿でも週をまたぐと値が伸びている点に注意。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .instagram import InstagramClient, InstagramError
from .line import LineClient, LineError
from .posts import Post
from .state import State


@dataclass
class PostRow:
    post_id: str
    platform: str
    published_at: datetime
    metrics: dict
    link: str | None = None
    error: str | None = None


def collect(
    posts: list[Post],
    state: State,
    start: datetime,
    end: datetime,
    instagram: InstagramClient | None,
    line: LineClient | None,
) -> tuple[list[PostRow], dict]:
    rows: list[PostRow] = []
    for post_id, entry in sorted(state.data["posts"].items()):
        for platform in ("instagram", "line"):
            result = entry.get(platform)
            if not result:
                continue
            published_at = datetime.fromisoformat(result["published_at"])
            if not (start <= published_at < end):
                continue
            row = PostRow(post_id, platform, published_at, {}, link=result.get("permalink"))
            try:
                if platform == "instagram" and instagram:
                    row.metrics = instagram.media_insights(result["media_id"])
                    row.link = row.metrics.pop("permalink", None) or row.link
                elif platform == "line" and line and result.get("request_id"):
                    row.metrics = line.message_event(result["request_id"])
                else:
                    row.error = "認証情報が未設定のため未取得"
            except (InstagramError, LineError) as e:
                row.error = str(e)
            rows.append(row)

    account: dict = {}
    if instagram:
        try:
            account["instagram"] = instagram.account()
        except InstagramError as e:
            account["instagram"] = {"error": str(e)}
    if line:
        # 友だち数は前日分まで集計済み
        day = (end - timedelta(days=1)).date()
        try:
            account["line"] = {"date": day.isoformat(), **line.followers(day)}
        except LineError as e:
            account["line"] = {"error": str(e)}
    return rows, account


def _fmt(value) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, (int, float)):
        return f"{value:,}"
    return str(value)


def _rate(numerator, denominator) -> str:
    if not isinstance(numerator, (int, float)) or not denominator:
        return "—"
    return f"{numerator / denominator:.1%}"


def render(rows: list[PostRow], account: dict, start: date, end: date, generated_at: datetime) -> str:
    out = [f"# SNS 運用レポート {start:%Y-%m-%d} 〜 {end:%Y-%m-%d}", ""]
    out.append(f"作成: {generated_at:%Y-%m-%d %H:%M}（数値は作成時点の累計）")
    out.append("")

    out += ["## アカウント", ""]
    ig = account.get("instagram")
    if ig:
        if "error" in ig:
            out.append(f"- Instagram: 取得失敗（{ig['error']}）")
        else:
            out.append(
                f"- Instagram @{ig.get('username', '?')}: フォロワー {_fmt(ig.get('followers_count'))} / "
                f"投稿数 {_fmt(ig.get('media_count'))}"
            )
    ln = account.get("line")
    if ln:
        if "error" in ln:
            out.append(f"- LINE: 取得失敗（{ln['error']}）")
        elif ln.get("status") != "ready":
            out.append(f"- LINE: {ln.get('date')} 分は未集計（status={ln.get('status')}）")
        else:
            out.append(
                f"- LINE（{ln['date']}時点）: 友だち {_fmt(ln.get('followers'))} / "
                f"ターゲットリーチ {_fmt(ln.get('targetedReaches'))} / ブロック {_fmt(ln.get('blocks'))}"
            )
    if not ig and not ln:
        out.append("- 認証情報が未設定のため未取得")
    out.append("")

    ig_rows = [r for r in rows if r.platform == "instagram"]
    line_rows = [r for r in rows if r.platform == "line"]

    out += ["## Instagram 投稿", ""]
    if ig_rows:
        out.append("| 投稿 | 公開日 | リーチ | 閲覧 | いいね | コメント | 保存 | シェア | 反応率 |")
        out.append("|---|---|--:|--:|--:|--:|--:|--:|--:|")
        for r in sorted(ig_rows, key=lambda r: r.published_at):
            m = r.metrics
            name = f"[{r.post_id}]({r.link})" if r.link else r.post_id
            if r.error:
                out.append(f"| {name} | {r.published_at:%m/%d} | 取得失敗: {r.error} |||||||")
                continue
            interactions = m.get("total_interactions")
            if interactions is None:
                parts = [m.get(k) for k in ("likes", "comments", "saved", "shares")]
                interactions = sum(v for v in parts if isinstance(v, (int, float))) or None
            out.append(
                f"| {name} | {r.published_at:%m/%d} | {_fmt(m.get('reach'))} | {_fmt(m.get('views'))} | "
                f"{_fmt(m.get('likes'))} | {_fmt(m.get('comments'))} | {_fmt(m.get('saved'))} | "
                f"{_fmt(m.get('shares'))} | {_rate(interactions, m.get('reach'))} |"
            )
        ranked = [r for r in ig_rows if not r.error and isinstance(r.metrics.get("reach"), (int, float))]
        if len(ranked) >= 2:
            best = max(ranked, key=lambda r: r.metrics["reach"])
            out += ["", f"リーチ最多: **{best.post_id}**（{_fmt(best.metrics['reach'])}）"]
    else:
        out.append("期間内の投稿はありません")
    out.append("")

    out += ["## LINE 配信", ""]
    if line_rows:
        out.append("| 配信 | 配信日 | 配信数 | 開封（ユニーク） | クリック（ユニーク） | 開封率 |")
        out.append("|---|---|--:|--:|--:|--:|")
        for r in sorted(line_rows, key=lambda r: r.published_at):
            m = r.metrics
            if r.error:
                out.append(f"| {r.post_id} | {r.published_at:%m/%d} | 取得失敗: {r.error} ||||")
                continue
            out.append(
                f"| {r.post_id} | {r.published_at:%m/%d} | {_fmt(m.get('delivered'))} | "
                f"{_fmt(m.get('uniqueImpression'))} | {_fmt(m.get('uniqueClick'))} | "
                f"{_rate(m.get('uniqueImpression'), m.get('delivered'))} |"
            )
        out += ["", "※ LINE の開封数は配信の翌日以降に集計され、少人数の場合は非表示（—）になります。"]
    else:
        out.append("期間内の配信はありません")
    out.append("")
    return "\n".join(out)
