import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dns_record import DnsRecord


class DnsRecordRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, record: DnsRecord) -> DnsRecord:
        self._session.add(record)
        await self._session.flush()
        return record

    async def get_for_route(self, route_id: uuid.UUID) -> DnsRecord | None:
        result = await self._session.execute(select(DnsRecord).where(DnsRecord.route_id == route_id))
        return result.scalar_one_or_none()
