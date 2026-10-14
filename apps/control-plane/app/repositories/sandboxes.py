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
