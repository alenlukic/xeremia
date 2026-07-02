from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from src.utils.http import RateLimitedHttpClient


class _Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _response(*, json_payload: Any = None, text: str | None = None) -> MagicMock:
    response = MagicMock()
    response.raise_for_status.return_value = None
    if json_payload is not None:
        response.json.return_value = json_payload
    if text is not None:
        response.text = text
    return response


def test_throttle_sleeps_when_interval_not_elapsed() -> None:
    clock = _Clock()
    slept: list[float] = []
    client = RateLimitedHttpClient(clock=clock, sleep=slept.append)

    client.throttle("mb", 1.0)  # first call records timestamp, no sleep
    clock.advance(0.25)
    client.throttle("mb", 1.0)

    assert slept and slept[0] == pytest.approx(0.75)


def test_throttle_does_not_sleep_when_enough_time_passed() -> None:
    clock = _Clock()
    slept: list[float] = []
    client = RateLimitedHttpClient(clock=clock, sleep=slept.append)

    client.throttle("mb", 1.0)
    clock.advance(5.0)
    client.throttle("mb", 1.0)

    assert slept == []


def test_throttle_is_isolated_per_rate_key() -> None:
    clock = _Clock()
    slept: list[float] = []
    client = RateLimitedHttpClient(clock=clock, sleep=slept.append)

    client.throttle("mb", 1.0)
    client.throttle("discogs", 1.0)  # different key, must not sleep

    assert slept == []


def test_throttle_noop_for_non_positive_interval() -> None:
    slept: list[float] = []
    client = RateLimitedHttpClient(sleep=slept.append)
    client.throttle("mb", 0.0)
    assert slept == []


def test_get_json_raises_for_non_object_payload() -> None:
    client = RateLimitedHttpClient(sleep=lambda _s: None)
    client.session.get = MagicMock(
        return_value=_response(json_payload=["not", "a", "dict"])
    )
    with pytest.raises(ValueError):
        client.get_json("https://example.com")


def test_get_json_returns_dict_and_applies_throttle() -> None:
    clock = _Clock()
    slept: list[float] = []
    client = RateLimitedHttpClient(clock=clock, sleep=slept.append)
    client.session.get = MagicMock(return_value=_response(json_payload={"ok": True}))

    assert client.get_json("https://example.com", rate_key="mb", min_interval=1.0) == {
        "ok": True
    }
    clock.advance(0.1)
    client.get_json("https://example.com", rate_key="mb", min_interval=1.0)
    assert slept and slept[0] == pytest.approx(0.9)


def test_get_text_returns_body() -> None:
    client = RateLimitedHttpClient(sleep=lambda _s: None)
    client.session.get = MagicMock(return_value=_response(text="<html>hi</html>"))
    assert client.get_text("https://example.com") == "<html>hi</html>"


def test_get_uses_default_timeout() -> None:
    get = MagicMock(return_value=_response(json_payload={}))
    client = RateLimitedHttpClient(default_timeout=7, sleep=lambda _s: None)
    client.session.get = get
    client.get("https://example.com")
    _, kwargs = get.call_args
    assert kwargs["timeout"] == 7
