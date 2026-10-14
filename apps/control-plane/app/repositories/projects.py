import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, project: Project) -> Project:
        self._session.add(project)
        await self._session.flush()
        return project

    async def get(self, project_id: uuid.UUID) -> Project | None:
        return await self._session.get(Project, project_id)

    async def get_by_slug(self, slug: str) -> Project | None:
        result = await self._session.execute(select(Project).where(Project.slug == slug))
        return result.scalar_one_or_none()

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[Project], int]:
        total = await self._session.scalar(select(func.count()).select_from(Project))
        rows = await self._session.scalars(
            select(Project).order_by(Project.created_at, Project.slug).limit(limit).offset(offset)
        )
        return rows.all(), int(total or 0)

    async def delete(self, project: Project) -> None:
        await self._session.delete(project)
        await self._session.flush()
