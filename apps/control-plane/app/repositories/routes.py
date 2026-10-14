import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.route import Route


class RouteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, route: Route) -> Route:
        self._session.add(route)
        await self._session.flush()
        return route

    async def get(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Route | None:
        result = await self._session.execute(
            select(Route).where(Route.id == route_id, Route.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def get_by_hostname(self, hostname: str) -> Route | None:
        result = await self._session.execute(select(Route).where(Route.hostname == hostname))
        return result.scalar_one_or_none()

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Route], int]:
        base = select(Route).where(Route.project_id == project_id)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery()))
        rows = await self._session.scalars(
            base.order_by(Route.created_at, Route.hostname).limit(limit).offset(offset)
        )
        return rows.all(), int(total or 0)

    async def list_enabled(self) -> Sequence[Route]:
        rows = await self._session.scalars(
            select(Route).where(Route.enabled.is_(True)).order_by(Route.hostname)
        )
        return rows.all()

    async def delete(self, route: Route) -> None:
        await self._session.delete(route)
        await self._session.flush()
