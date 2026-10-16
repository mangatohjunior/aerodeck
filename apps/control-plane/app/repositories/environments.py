import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Environment


class EnvironmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, environment: Environment) -> Environment:
        self._session.add(environment)
        await self._session.flush()
        return environment

    async def get(self, project_id: uuid.UUID, environment_id: uuid.UUID) -> Environment | None:
        result = await self._session.execute(
            select(Environment)
            .options(selectinload(Environment.project))
            .where(Environment.id == environment_id, Environment.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def get_by_slug(self, project_id: uuid.UUID, slug: str) -> Environment | None:
        result = await self._session.execute(
            select(Environment).where(Environment.project_id == project_id, Environment.slug == slug)
        )
        return result.scalar_one_or_none()

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Environment], int]:
        base = select(Environment).where(Environment.project_id == project_id)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await self._session.scalars(
            base.order_by(Environment.created_at, Environment.slug).limit(limit).offset(offset)
        )
        return rows.all(), int(total or 0)

    async def delete(self, environment: Environment) -> None:
        await self._session.delete(environment)
        await self._session.flush()
