"""Root conftest — deterministic native-library settings and test isolation.

This module executes before test modules import NumPy, SciPy, librosa, or Numba.
Thread pools are restricted to one worker to avoid conflicting BLAS runtimes,
Numba is directed to a repository-local pytest cache, and mainline tests are
prevented from making real outbound network calls. Tests must never modify
package-manager or third-party library directories such as site-packages.
"""

from __future__ import annotations

import ipaddress
import os
from pathlib import Path
import socket
from typing import Any

import pytest

_REPO_ROOT = Path(__file__).resolve().parent

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ["NUMBA_CACHE_DIR"] = str(_REPO_ROOT / ".pytest_cache" / "numba")


def _is_loopback_host(host: Any) -> bool:
    if host is None:
        return True
    normalized = str(host).strip().strip("[]").casefold()
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def _external_network_error(host: Any) -> RuntimeError:
    return RuntimeError(
        "Outbound network access is forbidden in the mainline test suite "
        f"(attempted host: {host!r}). Mark the test 'integration' and keep it "
        "out of the fast/default profile."
    )


@pytest.fixture(autouse=True)
def block_external_network(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch
):
    """Fail fast on live network access unless the test is explicitly integration."""
    if request.node.get_closest_marker("integration") is not None:
        return

    original_getaddrinfo = socket.getaddrinfo
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex

    def guarded_getaddrinfo(host: Any, *args: Any, **kwargs: Any):
        if not _is_loopback_host(host):
            raise _external_network_error(host)
        return original_getaddrinfo(host, *args, **kwargs)

    def guarded_connect(sock: socket.socket, address: Any):
        if isinstance(address, tuple) and not _is_loopback_host(address[0]):
            raise _external_network_error(address[0])
        return original_connect(sock, address)

    def guarded_connect_ex(sock: socket.socket, address: Any):
        if isinstance(address, tuple) and not _is_loopback_host(address[0]):
            raise _external_network_error(address[0])
        return original_connect_ex(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)
