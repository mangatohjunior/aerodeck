#!/usr/bin/env python3
"""Prune old DigitalOcean Container Registry (DOCR) image digests.

Starter registries allow only 1 repository and ~5 images total. Both
`control-plane` (`:main`) and `dashboard` (`:dashboard-main`) share the
`control-plane` repository; this script keeps protected tags (`main`,
`dashboard-main`) plus the newest `--keep` digests.

Online GC (`POST /v2/registries/{registry}/garbage-collection`) operates across
the entire registry and puts it in read-only mode for up to 15 minutes, blocking
concurrent pushes (`unauthorized:`). It is therefore opt-in via `--gc` for
off-peak maintenance, not executed on regular CI image pushes.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DO_API_BASE = "https://api.digitalocean.com/v2"
DEFAULT_KEEP = 2
PROTECTED_TAGS = ("main", "dashboard-main")


@dataclass(frozen=True)
class ManifestInfo:
    """Subset of a DOCR repository manifest entry."""

    digest: str
    updated_at: str
    tags: tuple[str, ...]


HttpMethod = Callable[[str, str, bytes | None], tuple[int, bytes]]


def _make_http_sender(token: str) -> HttpMethod:
    def send(method: str, url: str, body: bytes | None = None) -> tuple[int, bytes]:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    return send


def _parse_manifest(raw: object) -> ManifestInfo | None:
    if not isinstance(raw, dict):
        return None
    digest = raw.get("digest")
    updated_at = raw.get("updated_at", "")
    raw_tags = raw.get("tags")
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        return None
    tags: tuple[str, ...] = ()
    if isinstance(raw_tags, list):
        tags = tuple(str(item) for item in raw_tags if isinstance(item, str))
    return ManifestInfo(
        digest=digest,
        updated_at=str(updated_at) if isinstance(updated_at, str) else "",
        tags=tags,
    )


def list_repository_manifests(
    send: HttpMethod,
    registry: str,
    repository: str,
) -> list[ManifestInfo]:
    """Return all manifests in `registry/repository` (empty list on 404)."""
    reg = urllib.parse.quote(registry, safe="")
    repo = urllib.parse.quote(repository, safe="")
    urls = (
        f"{DO_API_BASE}/registries/{reg}/repositories/{repo}/digests?per_page=200",
        f"{DO_API_BASE}/registry/{reg}/repositories/{repo}/digests?per_page=200",
    )
    status = 404
    payload = b"{}"
    for url in urls:
        status, payload = send("GET", url, None)
        if status != 404:
            break
    if status == 404:
        return []
    if status != 200:
        raise RuntimeError(
            f"DOCR list digests for {registry}/{repository} failed ({status})"
        )
    parsed = json.loads(payload.decode("utf-8") or "{}")
    raw_list = parsed.get("manifests") if isinstance(parsed, dict) else None
    if not isinstance(raw_list, list):
        return []
    return [m for item in raw_list if (m := _parse_manifest(item)) is not None]


def _has_protected_tag(item: ManifestInfo) -> bool:
    return any(tag in PROTECTED_TAGS for tag in item.tags)


def select_digests_to_delete(
    manifests: list[ManifestInfo],
    keep: int,
) -> list[str]:
    """Keep `main` / `dashboard-main` manifests and newest manifests up to `keep`."""
    if keep < 1:
        raise ValueError("keep must be >= 1")
    ordered = sorted(
        manifests,
        key=lambda item: (_has_protected_tag(item), item.updated_at, item.digest),
        reverse=True,
    )
    retained = {item.digest for item in ordered[:keep]}
    for item in ordered:
        if _has_protected_tag(item):
            retained.add(item.digest)
    return [item.digest for item in ordered if item.digest not in retained]


def delete_repository_tag(
    send: HttpMethod,
    registry: str,
    repository: str,
    tag: str,
) -> bool:
    """Delete a tag; returns True on 200/202/204 or False on 404."""
    reg = urllib.parse.quote(registry, safe="")
    repo = urllib.parse.quote(repository, safe="")
    t = urllib.parse.quote(tag, safe="")
    urls = (
        f"{DO_API_BASE}/registries/{reg}/repositories/{repo}/tags/{t}",
        f"{DO_API_BASE}/registry/{reg}/repositories/{repo}/tags/{t}",
    )
    status = 404
    for url in urls:
        status, _ = send("DELETE", url, None)
        if status != 404:
            break
    return status in (200, 202, 204)


def delete_repository_digest(
    send: HttpMethod,
    registry: str,
    repository: str,
    digest: str,
) -> bool:
    """Delete a manifest digest; returns True when deleted (204) or False on 404/412."""
    reg = urllib.parse.quote(registry, safe="")
    repo = urllib.parse.quote(repository, safe="")
    dig = urllib.parse.quote(digest, safe="")
    urls = (
        f"{DO_API_BASE}/registries/{reg}/repositories/{repo}/digests/{dig}",
        f"{DO_API_BASE}/registry/{reg}/repositories/{repo}/digests/{dig}",
    )
    status = 404
    for url in urls:
        status, _ = send("DELETE", url, None)
        if status != 404:
            break
    if status in (404, 412):
        return False
    if status not in (200, 202, 204):
        raise RuntimeError(
            f"DOCR delete digest {digest} in {registry}/{repository} failed ({status})"
        )
    return True


def trigger_garbage_collection(send: HttpMethod, registry: str) -> bool:
    """Start online garbage collection on `registry`; ignores 409/422 if busy."""
    reg = urllib.parse.quote(registry, safe="")
    urls = (
        f"{DO_API_BASE}/registries/{reg}/garbage-collection",
        f"{DO_API_BASE}/registry/{reg}/garbage-collection",
    )
    body = json.dumps({"type": "untagged manifests and unreferenced blobs"}).encode(
        "utf-8"
    )
    status = 404
    for url in urls:
        status, _ = send("POST", url, body)
        if status != 404:
            break
    if status in (200, 201, 202):
        return True
    if status in (400, 404, 409, 422):
        return False
    raise RuntimeError(f"DOCR garbage collection for {registry} failed ({status})")


def prune_repository(
    send: HttpMethod,
    registry: str,
    repository: str,
    keep: int,
    run_gc: bool = False,
) -> list[str]:
    """Delete old digests in `registry/repository` beyond `keep`."""
    manifests = list_repository_manifests(send, registry, repository)
    by_digest = {m.digest: m for m in manifests}
    to_delete = select_digests_to_delete(manifests, keep)
    deleted: list[str] = []
    for digest in to_delete:
        entry = by_digest.get(digest)
        if entry is not None:
            for tag in entry.tags:
                if tag not in PROTECTED_TAGS:
                    delete_repository_tag(send, registry, repository, tag)
        if delete_repository_digest(send, registry, repository, digest):
            deleted.append(digest)
    if run_gc and (deleted or to_delete):
        trigger_garbage_collection(send, registry)
    return deleted


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--registry",
        default=os.environ.get("DOCR_NAME") or "aerodeck",
        help="DigitalOcean Container Registry name (default: aerodeck)",
    )
    parser.add_argument(
        "--repository",
        required=True,
        help="Repository name inside the registry (e.g. control-plane)",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=DEFAULT_KEEP,
        help="Maximum manifests to keep in this repository (default: 2)",
    )
    parser.add_argument(
        "--gc",
        action="store_true",
        dest="run_gc",
        help="Trigger online registry garbage collection (locks writes for up to 15 min)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    registry = (args.registry or "aerodeck").strip() or "aerodeck"
    token = (
        os.environ.get("DOCR_TOKEN")
        or os.environ.get("DIGITALOCEAN_TOKEN")
        or os.environ.get("AERODECK_DIGITALOCEAN_TOKEN")
        or ""
    ).strip()
    if not token:
        print("DOCR_TOKEN / DIGITALOCEAN_TOKEN is not set; skipping DOCR prune.")
        return 0
    send = _make_http_sender(token)
    deleted = prune_repository(
        send, registry, args.repository, args.keep, run_gc=args.run_gc
    )
    print(
        f"DOCR {registry}/{args.repository}: deleted {len(deleted)} old digest(s) "
        f"(keep={args.keep})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
