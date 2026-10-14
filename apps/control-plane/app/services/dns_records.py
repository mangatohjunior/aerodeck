"""Publish and withdraw the public address record for a route hostname."""

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import httpx
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.models.dns_record import DnsRecord, DnsRecordStatus, DnsRecordType
from app.models.route import Route
from app.repositories.dns_records import DnsRecordRepository
from app.services.dns01 import address_record_name

logger = get_logger("services.dns_records")


class DnsRecordError(AppError):
    status_code = 502
    code = "dns_record_failed"


class DnsRecordUnavailableError(AppError):
    status_code = 503
    code = "dns_record_unavailable"


@dataclass(frozen=True, slots=True)
class PublishedRecord:
    provider_record_id: str
    hostname: str
    record_type: str
    data: str
    ttl: int


class DnsRecordPublisher(Protocol):
    def upsert(self, hostname: str, record_type: str, data: str, ttl: int) -> PublishedRecord: ...

    def delete(self, hostname: str, provider_record_id: str | None) -> None: ...


class MemoryDnsRecords:
    """In-process address records for tests and laptops without DigitalOcean."""

    def __init__(self) -> None:
        self.published: dict[str, PublishedRecord] = {}
        self._next_id = 0

    def reset(self) -> None:
        self.published.clear()
        self._next_id = 0

    def upsert(self, hostname: str, record_type: str, data: str, ttl: int) -> PublishedRecord:
        address_record_name(hostname)
        self._next_id += 1
        record = PublishedRecord(str(self._next_id), hostname, record_type, data, ttl)
        self.published[hostname] = record
        return record

    def delete(self, hostname: str, provider_record_id: str | None) -> None:
        self.published.pop(hostname, None)


class DigitalOceanDnsRecords:
    """Creates and deletes A/AAAA/CNAME records through the DigitalOcean Domains API."""

    def __init__(
        self,
        token: str,
        *,
        client: httpx.Client | None = None,
        base_url: str = "https://api.digitalocean.com",
    ) -> None:
        self._token = token
        self._client = client or httpx.Client(base_url=base_url, timeout=10.0)

    def upsert(self, hostname: str, record_type: str, data: str, ttl: int) -> PublishedRecord:
        zone, name = address_record_name(hostname)
        response = self._client.post(
            f"/v2/domains/{zone}/records",
            headers=self._headers(),
            json={"type": record_type, "name": name, "data": data, "ttl": ttl},
        )
        if response.status_code >= 400:
            raise DnsRecordError(
                f"DigitalOcean refused to publish {hostname}: HTTP {response.status_code}"
            )
        record_id = response.json().get("domain_record", {}).get("id")
        if not isinstance(record_id, int):
            raise DnsRecordError(f"DigitalOcean publish for {hostname} returned no record id")
        return PublishedRecord(str(record_id), hostname, record_type, data, ttl)

    def delete(self, hostname: str, provider_record_id: str | None) -> None:
        if not provider_record_id:
            return
        zone, _name = address_record_name(hostname)
        response = self._client.delete(
            f"/v2/domains/{zone}/records/{provider_record_id}",
            headers=self._headers(),
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise DnsRecordError(
                f"DigitalOcean refused to delete {hostname}: HTTP {response.status_code}"
            )

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}


class DnsRecordService:
    def __init__(
        self,
        records: DnsRecordRepository,
        publisher: DnsRecordPublisher,
        *,
        record_type: DnsRecordType,
        data: str,
        ttl: int,
    ) -> None:
        self._records = records
        self._publisher = publisher
        self._record_type = record_type
        self._data = data
        self._ttl = ttl

    async def get_for_route(self, route_id: UUID) -> DnsRecord | None:
        return await self._records.get_for_route(route_id)

    async def require_for_route(self, route_id: UUID) -> DnsRecord:
        record = await self._records.get_for_route(route_id)
        if record is None or record.status is not DnsRecordStatus.published:
            raise NotFoundError(f"DNS record for route {route_id} not found")
        return record

    async def publish(self, route: Route) -> DnsRecord:
        published = await run_in_threadpool(
            self._publisher.upsert, route.hostname, self._record_type.value, self._data, self._ttl
        )
        record = await self._records.get_for_route(route.id)
        if record is None:
            record = await self._records.add(
                DnsRecord(
                    route_id=route.id,
                    hostname=published.hostname,
                    record_type=self._record_type,
                    data=published.data,
                    ttl=published.ttl,
                    provider_record_id=published.provider_record_id,
                    status=DnsRecordStatus.published,
                )
            )
        else:
            record.hostname = published.hostname
            record.record_type = self._record_type
            record.data = published.data
            record.ttl = published.ttl
            record.provider_record_id = published.provider_record_id
            record.status = DnsRecordStatus.published
        logger.info("published %s %s -> %s", record.record_type.value, record.hostname, record.data)
        return record

    async def unpublish(self, route: Route) -> None:
        record = await self._records.get_for_route(route.id)
        hostname = record.hostname if record is not None else route.hostname
        provider_id = record.provider_record_id if record is not None else None
        await run_in_threadpool(self._publisher.delete, hostname, provider_id)
        if record is not None:
            record.status = DnsRecordStatus.unpublished
            record.provider_record_id = None
            logger.info("unpublished DNS for %s", hostname)
