import uuid
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.route import Route
from app.repositories.routes import RouteRepository
from app.schemas.route import RouteCreate, RouteUpdate, TraefikConfiguration
from app.services.environments import EnvironmentService
from app.services.projects import ProjectService
from app.services.traefik import render_traefik_http

logger = get_logger("services.routes")


class RouteService:
    def __init__(
        self,
        routes: RouteRepository,
        projects: ProjectService,
        environments: EnvironmentService,
    ) -> None:
        self._routes = routes
        self._projects = projects
        self._environments = environments

    async def create(self, project_id: uuid.UUID, data: RouteCreate) -> Route:
        await self._projects.get(project_id)
        await self._environments.get(project_id, data.environment_id)
        if await self._routes.get_by_hostname(data.hostname) is not None:
            raise ConflictError(f"Hostname {data.hostname!r} is already routed")
        try:
            route = await self._routes.add(Route(project_id=project_id, **data.model_dump()))
        except IntegrityError as exc:
            raise ConflictError(f"Hostname {data.hostname!r} is already routed") from exc
        logger.info("created route %s (%s)", route.hostname, route.id)
        return route

    async def get(self, project_id: uuid.UUID, route_id: uuid.UUID) -> Route:
        await self._projects.get(project_id)
        route = await self._routes.get(project_id, route_id)
        if route is None:
            raise NotFoundError(f"Route {route_id} not found in project {project_id}")
        return route

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Route], int]:
        await self._projects.get(project_id)
        return await self._routes.list(project_id, limit=limit, offset=offset)

    async def update(self, project_id: uuid.UUID, route_id: uuid.UUID, data: RouteUpdate) -> Route:
        route = await self.get(project_id, route_id)
        changes = data.model_dump(exclude_unset=True)
        new_hostname = changes.get("hostname")
        if new_hostname is not None and new_hostname != route.hostname:
            existing = await self._routes.get_by_hostname(new_hostname)
            if existing is not None and existing.id != route.id:
                raise ConflictError(f"Hostname {new_hostname!r} is already routed")
        for field, value in changes.items():
            setattr(route, field, value)
        return route

    async def delete(self, project_id: uuid.UUID, route_id: uuid.UUID) -> None:
        route = await self.get(project_id, route_id)
        await self._routes.delete(route)
        logger.info("deleted route %s (%s)", route.hostname, route.id)

    async def traefik_configuration(self) -> TraefikConfiguration:
        return render_traefik_http(await self._routes.list_enabled())
