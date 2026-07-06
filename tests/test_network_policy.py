from __future__ import annotations

import socket

import pytest


def test_mainline_tests_reject_external_network_access() -> None:
    with pytest.raises(RuntimeError, match="forbidden in the mainline test suite"):
        socket.getaddrinfo("example.com", 443)


def test_mainline_tests_allow_loopback_network_resolution() -> None:
    assert socket.getaddrinfo("localhost", 0)
