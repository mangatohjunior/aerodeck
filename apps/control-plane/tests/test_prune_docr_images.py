"""Unit tests for DigitalOcean Container Registry (DOCR) image pruning."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from types import ModuleType

SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "prune_docr_images.py"
)


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("prune_docr_images", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["prune_docr_images"] = module
    spec.loader.exec_module(module)
    return module


def test_select_digests_keeps_main_and_newest() -> None:
    mod = _load_script()
    manifests = [
        mod.ManifestInfo(
            digest="sha256:oldest",
            updated_at="2026-10-20T10:00:00Z",
            tags=("aaa1111",),
        ),
        mod.ManifestInfo(
            digest="sha256:middle-main",
            updated_at="2026-10-22T10:00:00Z",
            tags=("main", "bbb2222"),
        ),
        mod.ManifestInfo(
            digest="sha256:second-newest",
            updated_at="2026-10-24T10:00:00Z",
            tags=("dashboard-main", "ccc3333"),
        ),
        mod.ManifestInfo(
            digest="sha256:newest",
            updated_at="2026-10-25T10:00:00Z",
            tags=("ddd4444",),
        ),
    ]
    deleted = mod.select_digests_to_delete(manifests, keep=2)
    assert deleted == ["sha256:newest", "sha256:oldest"]


def test_select_digests_rejects_keep_below_one() -> None:
    mod = _load_script()
    with pytest.raises(ValueError, match="keep must be >= 1"):
        mod.select_digests_to_delete([], keep=0)


def test_prune_repository_deletes_tags_and_digests() -> None:
    mod = _load_script()
    calls: list[tuple[str, str]] = []

    def fake_send(
        method: str, url: str, body: bytes | None = None
    ) -> tuple[int, bytes]:
        calls.append((method, url))
        if method == "GET":
            payload = {
                "manifests": [
                    {
                        "digest": "sha256:111",
                        "updated_at": "2026-10-21T00:00:00Z",
                        "tags": ["old1"],
                    },
                    {
                        "digest": "sha256:222",
                        "updated_at": "2026-10-23T00:00:00Z",
                        "tags": ["dashboard-main"],
                    },
                    {
                        "digest": "sha256:333",
                        "updated_at": "2026-10-25T00:00:00Z",
                        "tags": ["main", "new3"],
                    },
                ]
            }
            return 200, json.dumps(payload).encode("utf-8")
        if method == "DELETE":
            return 204, b""
        if method == "POST":
            assert body is not None
            return 201, b"{}"
        raise AssertionError(f"unexpected call {method} {url}")

    deleted = mod.prune_repository(fake_send, "aerodeck", "control-plane", keep=2)
    assert deleted == ["sha256:111"]
    assert any(method == "DELETE" and "tags/old1" in url for method, url in calls)
    assert any(
        method == "DELETE" and "sha256%3A111" in url for method, url in calls
    )
    assert any(
        method == "POST" and url.endswith("/garbage-collection")
        for method, url in calls
    )


def test_delete_repository_digest_handles_412_precondition_failed() -> None:
    mod = _load_script()

    def send_412(
        method: str, url: str, body: bytes | None = None
    ) -> tuple[int, bytes]:
        _ = (method, url, body)
        return 412, b'{"errors":[{"code":"PRECONDITION_FAILED"}]}'

    result = mod.delete_repository_digest(
        send_412, "aerodeck", "control-plane", "sha256:123"
    )
    assert result is False


def test_prune_repository_handles_missing_repo_and_busy_gc() -> None:
    mod = _load_script()

    def missing_repo(
        method: str, url: str, body: bytes | None = None
    ) -> tuple[int, bytes]:
        _ = (method, url, body)
        return 404, b"{}"

    assert mod.prune_repository(missing_repo, "aerodeck", "dashboard", keep=2) == []

    def busy_gc(
        method: str, url: str, body: bytes | None = None
    ) -> tuple[int, bytes]:
        _ = (method, url, body)
        return 409, b"{}"

    assert mod.trigger_garbage_collection(busy_gc, "aerodeck") is False


def test_main_skips_when_token_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    mod = _load_script()
    monkeypatch.delenv("DOCR_TOKEN", raising=False)
    monkeypatch.delenv("DIGITALOCEAN_TOKEN", raising=False)
    monkeypatch.delenv("AERODECK_DIGITALOCEAN_TOKEN", raising=False)
    assert mod.main(["--repository", "dashboard", "--keep", "2"]) == 0
