#!/usr/bin/env python3
"""Turn a DigitalOcean private Postgres URI into AERODECK_DATABASE_URL.

Copy the full VPC connection string from DigitalOcean (postgresql://user:pass@host:25060/db?sslmode=require),
not the hostname alone.
"""

from __future__ import annotations

import sys
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlparse


def rewrite_do_postgres_url(raw: str) -> str:
    value = raw.strip().strip("'\"")
    if value.startswith("postgresql+asyncpg://"):
        value = "postgresql://" + value[len("postgresql+asyncpg://") :]
    if not value.startswith("postgresql://"):
        raise SystemExit(
            "Pass the full DigitalOcean private URI starting with postgresql:// "
            "(user, password, host, port 25060, database). Not the hostname alone."
        )
    parsed = urlparse(value)
    if not parsed.hostname or not parsed.username or not parsed.password:
        raise SystemExit(
            "URI must include user, password, and host. "
            "Do not wrap the host in extra quotes."
        )
    if parsed.port is None:
        raise SystemExit("URI must include a port (DigitalOcean uses 25060).")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("sslmode", None)
    query["ssl"] = "require"
    user = quote(unquote(parsed.username), safe="")
    password = quote(unquote(parsed.password), safe="")
    path = parsed.path or "/defaultdb"
    return (
        f"postgresql+asyncpg://{user}:{password}@{parsed.hostname}:{parsed.port}"
        f"{path}?{urlencode(query)}"
    )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: rewrite_do_postgres_url.py '<postgresql://...>'")
    print(rewrite_do_postgres_url(sys.argv[1]))


if __name__ == "__main__":
    main()
