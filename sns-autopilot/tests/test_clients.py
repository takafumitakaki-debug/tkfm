from datetime import date

import pytest

from conftest import FakeResponse, FakeSession
from sns_autopilot.instagram import InstagramClient, InstagramError
from sns_autopilot.line import LineClient, LineError, retry_key


def ig(handler):
    session = FakeSession(handler)
    return InstagramClient("IGID", "SECRET", session=session, poll_interval=0, poll_timeout=1), session


def test_instagram_single_image_publish():
    def handler(method, url, kw):
        if url.endswith("/IGID/media"):
            assert kw["data"]["image_url"] == "https://x/a.jpg"
            assert kw["data"]["caption"] == "cap"
            return FakeResponse(body={"id": "C1"})
        if url.endswith("/C1"):
            return FakeResponse(body={"status_code": "FINISHED"})
        if url.endswith("/media_publish"):
            assert kw["data"]["creation_id"] == "C1"
            return FakeResponse(body={"id": "M1"})
        if url.endswith("/M1"):
            return FakeResponse(body={"permalink": "https://instagram.com/p/x"})
        raise AssertionError(url)

    client, _ = ig(handler)
    assert client.publish(["https://x/a.jpg"], "cap") == {"media_id": "M1", "permalink": "https://instagram.com/p/x"}


def test_instagram_carousel_publish():
    created = []

    def handler(method, url, kw):
        if url.endswith("/IGID/media"):
            data = kw["data"]
            if data.get("media_type") == "CAROUSEL":
                assert data["children"] == "K0,K1"
                assert data["caption"] == "cap"
                return FakeResponse(body={"id": "PARENT"})
            assert data["is_carousel_item"] == "true"
            created.append(data["image_url"])
            return FakeResponse(body={"id": f"K{len(created) - 1}"})
        if method == "GET" and "fields" in kw["params"] and "status_code" in kw["params"]["fields"]:
            return FakeResponse(body={"status_code": "FINISHED"})
        if url.endswith("/media_publish"):
            assert kw["data"]["creation_id"] == "PARENT"
            return FakeResponse(body={"id": "M2"})
        return FakeResponse(body={})

    client, _ = ig(handler)
    assert client.publish(["https://x/1.jpg", "https://x/2.jpg"], "cap")["media_id"] == "M2"
    assert created == ["https://x/1.jpg", "https://x/2.jpg"]


def test_instagram_error_does_not_leak_token():
    def handler(method, url, kw):
        return FakeResponse(400, {"error": {"message": "Invalid parameter", "code": 100}})

    client, _ = ig(handler)
    with pytest.raises(InstagramError) as exc:
        client.publish(["https://x/a.jpg"], "cap")
    assert "Invalid parameter" in str(exc.value)
    assert "SECRET" not in str(exc.value)


def test_instagram_container_error_status():
    def handler(method, url, kw):
        if url.endswith("/IGID/media"):
            return FakeResponse(body={"id": "C1"})
        return FakeResponse(body={"status_code": "ERROR"})

    client, _ = ig(handler)
    with pytest.raises(InstagramError, match="ERROR"):
        client.publish(["https://x/a.jpg"], "cap")


def test_instagram_insights_fall_back_per_metric():
    def handler(method, url, kw):
        if url.endswith("/insights"):
            metric = kw["params"]["metric"]
            if "," in metric or metric == "views":
                return FakeResponse(400, {"error": {"message": "unsupported metric"}})
            return FakeResponse(body={"data": [{"name": metric, "values": [{"value": 10}]}]})
        return FakeResponse(body={"like_count": 5, "comments_count": 1, "permalink": "p"})

    client, _ = ig(handler)
    result = client.media_insights("M1")
    assert result["likes"] == 5
    assert result["reach"] == 10
    assert "views" not in result


def test_line_broadcast_uses_stable_retry_key():
    def handler(method, url, kw):
        assert url.endswith("/message/broadcast")
        assert kw["headers"]["X-Line-Retry-Key"] == retry_key("post-1")
        assert kw["json"]["messages"][0] == {"type": "text", "text": "hello"}
        assert kw["json"]["messages"][1]["type"] == "image"
        return FakeResponse(200, {}, {"x-line-request-id": "R1"})

    client = LineClient("TOKEN", session=FakeSession(handler))
    assert client.broadcast("post-1", "hello", ["https://x/a.jpg"]) == {"request_id": "R1"}
    assert retry_key("post-1") == retry_key("post-1") != retry_key("post-2")


def test_line_broadcast_409_duplicate_is_success():
    def handler(method, url, kw):
        return FakeResponse(409, {"message": "already accepted"}, {"x-line-accepted-request-id": "R0"})

    client = LineClient("TOKEN", session=FakeSession(handler))
    assert client.broadcast("p", "hi", []) == {"request_id": "R0", "deduplicated": True}


def test_line_error_message():
    def handler(method, url, kw):
        return FakeResponse(400, {"message": "The request body has 1 error(s)", "details": [{"property": "messages[0].text", "message": "too long"}]})

    client = LineClient("TOKEN", session=FakeSession(handler))
    with pytest.raises(LineError, match="too long"):
        client.broadcast("p", "hi", [])


def test_line_followers_date_param():
    def handler(method, url, kw):
        assert kw["params"] == {"date": "20261006"}
        return FakeResponse(body={"status": "ready", "followers": 100})

    client = LineClient("TOKEN", session=FakeSession(handler))
    assert client.followers(date(2026, 10, 6))["followers"] == 100
