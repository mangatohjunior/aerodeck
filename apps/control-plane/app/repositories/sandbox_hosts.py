import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox_host import SandboxHost, SandboxHostStatus


class SandboxHostRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, host: SandboxHost) -> SandboxHost:
        self._session.add(host)
        await self._session.flush()
        return host

    async def get(self, host_id: uuid.UUID) -> SandboxHost | None:
        result = await self._session.execute(select(SandboxHost).where(SandboxHost.id == host_id))
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> SandboxHost | None:
        result = await self._session.execute(select(SandboxHost).where(SandboxHost.name == name))
        return result.scalar_one_or_none()

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[SandboxHost], int]:
        base = select(SandboxHost)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await self._session.scalars(base.order_by(SandboxHost.name).limit(limit).offset(offset))
        return rows.all(), int(total or 0)

    async def list_enrolled(self) -> Sequence[SandboxHost]:
        rows = await self._session.scalars(
            select(SandboxHost)
            .where(SandboxHost.status == SandboxHostStatus.enrolled)
            .order_by(SandboxHost.name)
        )
        return rows.all()

    async def delete(self, host: SandboxHost) -> None:
        await self._session.delete(host)
        await self._session.flush()
