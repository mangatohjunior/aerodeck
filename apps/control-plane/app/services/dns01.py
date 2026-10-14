"""DNS-01 challenge records. ACME writes TXT at _acme-challenge.<hostname>."""

from typing import Protocol

import httpx

from app.core.errors import AppError


class Dns01Error(AppError):
    status_code = 502
    code = "dns01_failed"


class Dns01UnavailableError(AppError):
    status_code = 503
    code = "dns01_unavailable"


class Dns01Provider(Protocol):
    def present(self, hostname: str, digest: str) -> None: ...

    def cleanup(self, hostname: str) -> None: ...


def split_zone(hostname: str) -> tuple[str, str]:
    """Return (zone, relative prefix). Prefix is empty for the zone apex.

    `payments.example.com` → (`example.com`, `payments`)
    `example.com` → (`example.com`, ``)
    """
    labels = hostname.rstrip(".").lower().split(".")
    if len(labels) < 2:
        raise Dns01Error(f"Hostname {hostname!r} has no registrable domain")
    zone = ".".join(labels[-2:])
    prefix = ".".join(labels[:-2])
    return zone, prefix


def dns01_target(hostname: str) -> tuple[str, str]:
    """Return (zone, TXT name) for `_acme-challenge` on hostname."""
    zone, prefix = split_zone(hostname)
    name = f"_acme-challenge.{prefix}" if prefix else "_acme-challenge"
    return zone, name


def address_record_name(hostname: str) -> tuple[str, str]:
    """Return (zone, record name) for an A/AAAA/CNAME. Apex uses `@`."""
    zone, prefix = split_zone(hostname)
    return zone, prefix if prefix else "@"


class MemoryDns01:
    """In-process TXT store used by the fake ACME issuer and unit tests."""

    def __init__(self) -> None:
        self.records: dict[str, str] = {}

    def present(self, hostname: str, digest: str) -> None:
        dns01_target(hostname)
        self.records[hostname] = digest

    def cleanup(self, hostname: str) -> None:
        self.records.pop(hostname, None)


class DigitalOceanDns01:
    """Creates and deletes TXT records through the DigitalOcean Domains API."""

    def __init__(
        self,
        token: str,
        *,
        client: httpx.Client | None = None,
        base_url: str = "https://api.digitalocean.com",
    ) -> None:
        self._token = token
        self._client = client or httpx.Client(base_url=base_url, timeout=10.0)
        self._record_ids: dict[str, int] = {}

    def present(self, hostname: str, digest: str) -> None:
        zone, name = dns01_target(hostname)
        response = self._client.post(
            f"/v2/domains/{zone}/records",
            headers=self._headers(),
            json={"type": "TXT", "name": name, "data": digest, "ttl": 30},
        )
        if response.status_code >= 400:
            raise Dns01Error(f"DigitalOcean refused DNS-01 present for {hostname}: HTTP {response.status_code}")
        record_id = response.json().get("domain_record", {}).get("id")
        if not isinstance(record_id, int):
            raise Dns01Error(f"DigitalOcean DNS-01 present for {hostname} returned no record id")
        self._record_ids[hostname] = record_id

    def cleanup(self, hostname: str) -> None:
        record_id = self._record_ids.pop(hostname, None)
        if record_id is None:
            return
        zone, _name = dns01_target(hostname)
        response = self._client.delete(
            f"/v2/domains/{zone}/records/{record_id}",
            headers=self._headers(),
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise Dns01Error(f"DigitalOcean refused DNS-01 cleanup for {hostname}: HTTP {response.status_code}")

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}
