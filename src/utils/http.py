from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from typing import Any

import requests

DEFAULT_TIMEOUT_SECONDS = 15


class RateLimitedHttpClient:
    """A small ``requests.Session`` wrapper with per-key request throttling.

    Throttling state lives on the instance and is keyed by an arbitrary rate
    key (typically a provider name). Keeping the last-request timestamps as
    instance state — rather than module-level globals — isolates limiting per
    client and keeps the transport layer free of shared mutable module state.
    """

    def __init__(
        self,
        *,
        user_agent: str | None = None,
        default_timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.session = session or requests.Session()
        if user_agent:
            self.session.headers.update({"User-Agent": user_agent})
        self.default_timeout = default_timeout
        self._clock = clock
        self._sleep = sleep
        self._last_request_at: dict[str, float] = {}

    def throttle(self, rate_key: str, min_interval: float) -> None:
        if min_interval <= 0:
            return
        last = self._last_request_at.get(rate_key)
        if last is not None:
            delay = min_interval - (self._clock() - last)
            if delay > 0:
                self._sleep(delay)
        self._last_request_at[rate_key] = self._clock()

    def get(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
        rate_key: str | None = None,
        min_interval: float = 0.0,
    ) -> requests.Response:
        if rate_key is not None:
            self.throttle(rate_key, min_interval)
        response = self.session.get(
            url,
            params=params,
            headers=headers,
            timeout=timeout if timeout is not None else self.default_timeout,
        )
        response.raise_for_status()
        return response

    def get_json(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
        rate_key: str | None = None,
        min_interval: float = 0.0,
    ) -> dict[str, Any]:
        response = self.get(
            url,
            params=params,
            headers=headers,
            timeout=timeout,
            rate_key=rate_key,
            min_interval=min_interval,
        )
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError(f"{url} returned a non-object JSON payload")
        return data

    def get_text(
        self,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
        rate_key: str | None = None,
        min_interval: float = 0.0,
    ) -> str:
        response = self.get(
            url,
            params=params,
            headers=headers,
            timeout=timeout,
            rate_key=rate_key,
            min_interval=min_interval,
        )
        return response.text
