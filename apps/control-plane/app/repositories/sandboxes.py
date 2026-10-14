import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import Sandbox, SandboxStatus


class SandboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, sandbox: Sandbox) -> Sandbox:
        self._session.add(sandbox)
        await self._session.flush()
        return sandbox

    async def get(self, project_id: uuid.UUID, sandbox_id: uuid.UUID) -> Sandbox | None:
        result = await self._session.execute(
            select(Sandbox).where(Sandbox.id == sandbox_id, Sandbox.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Sandbox], int]:
        base = select(Sandbox).where(Sandbox.project_id == project_id)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await self._session.scalars(
            base.order_by(Sandbox.created_at, Sandbox.image).limit(limit).offset(offset)
        )
        return rows.all(), int(total or 0)

    async def list_expired(self, now: datetime) -> Sequence[Sandbox]:
        rows = await self._session.scalars(
            select(Sandbox)
            .where(Sandbox.status == SandboxStatus.running, Sandbox.expires_at <= now)
            .order_by(Sandbox.expires_at)
        )
        return rows.all()

    async def count_running_on_host(self, host_id: uuid.UUID) -> int:
        total = await self._session.scalar(
            select(func.count()).where(Sandbox.host_id == host_id, Sandbox.status == SandboxStatus.running)
        )
        return int(total or 0)

    async def count_running_by_host(self) -> dict[uuid.UUID, int]:
        rows = await self._session.execute(
            select(Sandbox.host_id, func.count())
            .where(Sandbox.status == SandboxStatus.running, Sandbox.host_id.is_not(None))
            .group_by(Sandbox.host_id)
        )
        return {host_id: count for host_id, count in rows.all() if host_id is not None}
