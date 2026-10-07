"""LINE Messaging API（一斉配信・インサイト）。

一斉配信には X-Line-Retry-Key を付ける。同じキーでの再送は LINE 側で重複排除される
（409 が返る）ため、タイムアウト後に再実行しても友だちに二重配信されない。
"""

from __future__ import annotations

import uuid
from datetime import date

import requests

API = "https://api.line.me/v2/bot"
_RETRY_NAMESPACE = uuid.UUID("6f1c3b8e-2d4a-4c7e-9b1f-5a0e8d7c6b4a")


class LineError(RuntimeError):
    pass


def retry_key(post_id: str) -> str:
    """投稿IDから決まる固定のリトライキー（何度実行しても同じ値）。"""
    return str(uuid.uuid5(_RETRY_NAMESPACE, f"line-broadcast:{post_id}"))


class LineClient:
    def __init__(self, channel_access_token: str, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.headers = {"Authorization": f"Bearer {channel_access_token}"}

    def _request(self, method: str, path: str, *, json=None, params=None, headers=None) -> requests.Response:
        try:
            return self.session.request(
                method,
                f"{API}/{path}",
                json=json,
                params=params,
                headers={**self.headers, **(headers or {})},
                timeout=60,
            )
        except requests.RequestException as e:
            raise LineError(f"通信エラー: {type(e).__name__}") from None

    @staticmethod
    def _error(resp: requests.Response) -> LineError:
        try:
            body = resp.json()
            detail = body.get("message", "")
            if body.get("details"):
                detail += " " + "; ".join(f"{d.get('property')}: {d.get('message')}" for d in body["details"])
        except ValueError:
            detail = resp.text[:200]
        return LineError(f"HTTP {resp.status_code}: {detail}")

    # --- 配信 ---------------------------------------------------------------

    @staticmethod
    def build_messages(text: str, image_urls: list[str]) -> list[dict]:
        messages: list[dict] = []
        if text:
            messages.append({"type": "text", "text": text})
        for url in image_urls[:4]:
            messages.append({"type": "image", "originalContentUrl": url, "previewImageUrl": url})
        return messages

    def broadcast(self, post_id: str, text: str, image_urls: list[str]) -> dict:
        messages = self.build_messages(text, image_urls)
        if not messages:
            raise LineError("送信するメッセージがありません")
        resp = self._request(
            "POST",
            "message/broadcast",
            json={"messages": messages},
            headers={"X-Line-Retry-Key": retry_key(post_id)},
        )
        if resp.status_code == 200:
            return {"request_id": resp.headers.get("x-line-request-id")}
        if resp.status_code == 409 and resp.headers.get("x-line-accepted-request-id"):
            # 同じリトライキーで既に受理済み = 前回の実行で配信できていた
            return {"request_id": resp.headers["x-line-accepted-request-id"], "deduplicated": True}
        raise self._error(resp)

    # --- インサイト ---------------------------------------------------------
    # 集計は翌日以降に確定する。未集計の場合 status が "unready" になる。

    def followers(self, day: date) -> dict:
        resp = self._request("GET", "insight/followers", params={"date": day.strftime("%Y%m%d")})
        if resp.status_code != 200:
            raise self._error(resp)
        return resp.json()

    def message_event(self, request_id: str) -> dict:
        resp = self._request("GET", "insight/message/event", params={"requestId": request_id})
        if resp.status_code != 200:
            raise self._error(resp)
        return resp.json().get("overview", {})
