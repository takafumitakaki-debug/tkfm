import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class FakeResponse:
    def __init__(self, status_code=200, body=None, headers=None):
        self.status_code = status_code
        self._body = body if body is not None else {}
        self.headers = headers or {}
        self.text = json.dumps(self._body)

    def json(self):
        return self._body


class FakeSession:
    """requests.Session の代役。handler(method, url, kwargs) -> FakeResponse"""

    def __init__(self, handler):
        self.handler = handler
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.handler(method, url, kwargs)


@pytest.fixture
def write_post(tmp_path):
    posts_dir = tmp_path / "posts"
    posts_dir.mkdir()

    def _write(name, text):
        path = posts_dir / name
        path.write_text(text, encoding="utf-8")
        return path

    _write.dir = posts_dir
    return _write
