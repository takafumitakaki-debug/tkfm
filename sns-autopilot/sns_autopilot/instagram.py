"""Instagram Graph API（コンテンツ公開・インサイト）。

公開は「メディアコンテナ作成 → 処理完了待ち → media_publish」の3段階。
2枚以上はカルーセル（子コンテナを作ってから親コンテナにまとめる）。
"""

from __future__ import annotations

import time

import requests


class InstagramError(RuntimeError):
    pass


class InstagramClient:
    def __init__(
        self,
        ig_user_id: str,
        access_token: str,
        api_version: str = "v23.0",
        session: requests.Session | None = None,
        poll_interval: float = 3.0,
        poll_timeout: float = 120.0,
    ):
        self.ig_user_id = ig_user_id
        self.access_token = access_token
        self.base = f"https://graph.facebook.com/{api_version}"
        self.session = session or requests.Session()
        self.poll_interval = poll_interval
        self.poll_timeout = poll_timeout

    # --- HTTP ---------------------------------------------------------------

    def _request(self, method: str, path: str, **params) -> dict:
        params["access_token"] = self.access_token
        kwargs = {"params": params} if method == "GET" else {"data": params}
        try:
            resp = self.session.request(method, f"{self.base}/{path}", timeout=60, **kwargs)
        except requests.RequestException as e:
            # 例外メッセージに URL（=アクセストークン）が含まれ得るので型名だけ出す
            raise InstagramError(f"通信エラー: {type(e).__name__}") from None
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if resp.status_code >= 400 or "error" in body:
            err = body.get("error", {})
            raise InstagramError(
                f"HTTP {resp.status_code}: {err.get('message', resp.text[:200])} "
                f"(code={err.get('code')}, subcode={err.get('error_subcode')})"
            )
        return body

    # --- 公開 ---------------------------------------------------------------

    def publish(self, image_urls: list[str], caption: str) -> dict:
        if not image_urls:
            raise InstagramError("画像がありません")
        if len(image_urls) == 1:
            container = self._request(
                "POST", f"{self.ig_user_id}/media", image_url=image_urls[0], caption=caption
            )["id"]
        else:
            children = [
                self._request(
                    "POST", f"{self.ig_user_id}/media", image_url=url, is_carousel_item="true"
                )["id"]
                for url in image_urls
            ]
            for child in children:
                self._wait_until_ready(child)
            container = self._request(
                "POST",
                f"{self.ig_user_id}/media",
                media_type="CAROUSEL",
                children=",".join(children),
                caption=caption,
            )["id"]

        self._wait_until_ready(container)
        media_id = self._request("POST", f"{self.ig_user_id}/media_publish", creation_id=container)["id"]
        permalink = None
        try:
            permalink = self._request("GET", media_id, fields="permalink").get("permalink")
        except InstagramError:
            pass  # 公開自体は成功しているので permalink 取得失敗は無視
        return {"media_id": media_id, "permalink": permalink}

    def _wait_until_ready(self, container_id: str) -> None:
        deadline = time.monotonic() + self.poll_timeout
        while True:
            status = self._request("GET", container_id, fields="status_code,status").get("status_code")
            if status in ("FINISHED", "PUBLISHED"):
                return
            if status in ("ERROR", "EXPIRED"):
                raise InstagramError(f"メディア処理に失敗: container={container_id} status={status}")
            if time.monotonic() > deadline:
                raise InstagramError(f"メディア処理がタイムアウト: container={container_id} status={status}")
            time.sleep(self.poll_interval)

    # --- インサイト ---------------------------------------------------------

    MEDIA_METRICS = ("reach", "views", "saved", "shares", "total_interactions")

    def account(self) -> dict:
        return self._request("GET", self.ig_user_id, fields="username,followers_count,media_count")

    def media_insights(self, media_id: str) -> dict:
        info = self._request("GET", media_id, fields="like_count,comments_count,permalink,timestamp")
        result = {
            "likes": info.get("like_count"),
            "comments": info.get("comments_count"),
            "permalink": info.get("permalink"),
            "timestamp": info.get("timestamp"),
        }
        result.update(self._metrics(media_id, self.MEDIA_METRICS))
        return result

    def _metrics(self, media_id: str, metrics: tuple[str, ...]) -> dict:
        # 指標はAPIバージョンやメディア種別で使えないものがある。
        # まとめて取得し、失敗したら1つずつ取り直して取れたものだけ返す。
        try:
            return self._parse_insights(self._request("GET", f"{media_id}/insights", metric=",".join(metrics)))
        except InstagramError:
            result = {}
            for metric in metrics:
                try:
                    result.update(self._parse_insights(self._request("GET", f"{media_id}/insights", metric=metric)))
                except InstagramError:
                    continue
            return result

    @staticmethod
    def _parse_insights(body: dict) -> dict:
        out = {}
        for item in body.get("data", []):
            values = item.get("values") or [{}]
            value = item.get("total_value", {}).get("value", values[0].get("value"))
            out[item["name"]] = value
        return out
