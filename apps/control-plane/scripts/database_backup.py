#!/usr/bin/env python3
"""Backup and restore the control-plane database via a private Spaces prefix.

Run this on the Droplet (the private Postgres host is not reachable from
GitHub Actions or a laptop). Credentials come from the environment, never
from git.

Object keys look like::

    backups/control-plane/<env>/<alembic-revision>/<utc-stamp>.dump

``fetch`` refuses to download when the revision in that key is not the
revision the operator passed. Same idea as restoring the wrong Terraform
state version.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import os
import re
import sys
import urllib.error
import urllib.request

BUCKET = os.environ.get("SPACES_BUCKET", "aerodeck-tfstate")
ENDPOINT = os.environ.get("SPACES_ENDPOINT", "nyc3.digitaloceanspaces.com")
REGION = "us-east-1"
SERVICE = "s3"
PREFIX = "backups/control-plane"

_ENV = re.compile(r"^[a-z0-9]{1,16}$")
_REVISION = re.compile(r"^[A-Za-z0-9_]{1,32}$")
_STAMP = re.compile(r"^[0-9]{8}T[0-9]{6}Z$")


class WrongRevision(SystemExit):
    def __init__(self, found: str, expected: str) -> None:
        super().__init__(f"refusing restore: dump revision {found} != expected {expected}")


def backup_key(env: str, revision: str, stamp: str) -> str:
    if not _ENV.fullmatch(env) or not _REVISION.fullmatch(revision) or not _STAMP.fullmatch(stamp):
        raise ValueError("env, revision, or stamp is not safe for an object key")
    return f"{PREFIX}/{env}/{revision}/{stamp}.dump"


def revision_in_key(key: str) -> str:
    parts = key.split("/")
    if len(parts) != 5 or parts[0] != "backups" or parts[1] != "control-plane" or not key.endswith(".dump"):
        raise ValueError(f"not a control-plane backup key: {key}")
    env, revision, filename = parts[2], parts[3], parts[4]
    stamp = filename[: -len(".dump")]
    if backup_key(env, revision, stamp) != key:
        raise ValueError(f"not a control-plane backup key: {key}")
    return revision


def require_expected_revision(key: str, expected: str) -> str:
    found = revision_in_key(key)
    if found != expected:
        raise WrongRevision(found, expected)
    return found


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def _signing_key(secret: str, datestamp: str) -> bytes:
    date_key = _sign(f"AWS4{secret}".encode(), datestamp)
    region_key = _sign(date_key, REGION)
    service_key = _sign(region_key, SERVICE)
    return _sign(service_key, "aws4_request")


def _request(
    method: str,
    key: str,
    payload: bytes,
    access_key: str,
    secret_key: str,
    now: dt.datetime | None = None,
) -> urllib.request.Request:
    moment = now or dt.datetime.now(dt.timezone.utc)
    amz_date = moment.strftime("%Y%m%dT%H%M%SZ")
    datestamp = moment.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(payload).hexdigest()
    host = f"{BUCKET}.{ENDPOINT}"
    canonical_uri = "/" + key
    canonical_headers = f"host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        [method, canonical_uri, "", canonical_headers, signed_headers, payload_hash]
    )
    scope = f"{datestamp}/{REGION}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ]
    )
    signature = hmac.new(_signing_key(secret_key, datestamp), string_to_sign.encode(), hashlib.sha256).hexdigest()
    authorization = f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    return urllib.request.Request(
        url=f"https://{host}{canonical_uri}",
        data=payload if method == "PUT" else None,
        method=method,
        headers={
            "Host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            "Authorization": authorization,
        },
    )


def _credentials() -> tuple[str, str]:
    access = os.environ.get("AWS_ACCESS_KEY_ID", "")
    secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    if not access or not secret:
        raise SystemExit("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required")
    return access, secret


def put_dump(key: str, payload: bytes, opener=urllib.request.urlopen) -> None:
    access, secret = _credentials()
    request = _request("PUT", key, payload, access, secret)
    if secret in request.get_header("Authorization", ""):
        raise SystemExit("refusing to send a request that contains the Spaces secret")
    try:
        with opener(request, timeout=60) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Spaces rejected the backup upload: HTTP {exc.code}") from exc


def fetch_dump(key: str, expected: str, opener=urllib.request.urlopen) -> bytes:
    require_expected_revision(key, expected)
    access, secret = _credentials()
    request = _request("GET", key, b"", access, secret)
    try:
        with opener(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Spaces rejected the backup download: HTTP {exc.code}") from exc


def _cmd_check(args: argparse.Namespace) -> None:
    require_expected_revision(args.key, args.expect)
    print(f"revision {args.expect} matches {args.key}")


def _cmd_put(args: argparse.Namespace) -> None:
    payload = args.file.read()
    key = backup_key(args.env, args.revision, args.stamp)
    put_dump(key, payload)
    print(key)


def _cmd_fetch(args: argparse.Namespace) -> None:
    body = fetch_dump(args.key, args.expect)
    args.dest.write(body)
    print(f"wrote {args.dest} revision {args.expect}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Control-plane Postgres backup in Spaces")
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check-key")
    check.add_argument("--key", required=True)
    check.add_argument("--expect", required=True)
    check.set_defaults(func=_cmd_check)

    put = sub.add_parser("put")
    put.add_argument("--env", required=True)
    put.add_argument("--revision", required=True)
    put.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    put.add_argument("--file", required=True, type=argparse.FileType("rb"))
    put.set_defaults(func=_cmd_put)

    fetch = sub.add_parser("fetch")
    fetch.add_argument("--key", required=True)
    fetch.add_argument("--expect", required=True)
    fetch.add_argument("--dest", required=True, type=argparse.FileType("wb"))
    fetch.set_defaults(func=_cmd_fetch)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main(sys.argv[1:])
