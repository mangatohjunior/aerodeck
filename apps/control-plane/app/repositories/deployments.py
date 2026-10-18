import uuid
from collections.abc import Sequence

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deployment import Deployment


class DeploymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, deployment: Deployment) -> Deployment:
        self._session.add(deployment)
        await self._session.flush()
        return deployment

    async def get(self, deployment_id: uuid.UUID) -> Deployment | None:
        return await self._session.get(Deployment, deployment_id)

    async def save(self, deployment: Deployment) -> Deployment:
        await self.add(deployment)
        await self._session.refresh(deployment)
        return deployment

    async def clear_environment_link(self, environment_id: uuid.UUID) -> None:
        """Null both link columns so the both-or-neither invariant survives env delete."""
        await self._session.execute(
            update(Deployment)
            .where(Deployment.environment_id == environment_id)
            .values(project_id=None, environment_id=None)
        )

    async def clear_project_link(self, project_id: uuid.UUID) -> None:
        """Null both link columns so the both-or-neither invariant survives project delete."""
        await self._session.execute(
            update(Deployment)
            .where(Deployment.project_id == project_id)
            .values(project_id=None, environment_id=None)
        )

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[Deployment], int]:
        total = await self._session.scalar(select(func.count()).select_from(Deployment))
        rows = await self._session.scalars(
            select(Deployment).order_by(Deployment.started_at.desc(), Deployment.id.desc()).limit(limit).offset(offset)
        )
        return rows.all(), int(total or 0)
