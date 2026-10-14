import uuid
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.project import Environment
from app.repositories.environments import EnvironmentRepository
from app.schemas.environment import EnvironmentCreate, EnvironmentUpdate
from app.services.projects import ProjectService

logger = get_logger("services.environments")


class EnvironmentService:
    def __init__(self, environments: EnvironmentRepository, projects: ProjectService) -> None:
        self._environments = environments
        self._projects = projects

    async def create(self, project_id: uuid.UUID, data: EnvironmentCreate) -> Environment:
        project = await self._projects.get(project_id)
        if await self._environments.get_by_slug(project.id, data.slug) is not None:
            raise ConflictError(f"Environment slug {data.slug!r} already exists in project {project.slug!r}")
        try:
            environment = await self._environments.add(Environment(project_id=project.id, **data.model_dump()))
        except IntegrityError as exc:
            raise ConflictError(f"Environment slug {data.slug!r} already exists in project {project.slug!r}") from exc
        logger.info("created environment %s/%s (%s)", project.slug, environment.slug, environment.id)
        return environment

    async def get(self, project_id: uuid.UUID, environment_id: uuid.UUID) -> Environment:
        await self._projects.get(project_id)
        environment = await self._environments.get(project_id, environment_id)
        if environment is None:
            raise NotFoundError(f"Environment {environment_id} not found in project {project_id}")
        return environment

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Environment], int]:
        await self._projects.get(project_id)
        return await self._environments.list(project_id, limit=limit, offset=offset)

    async def update(self, project_id: uuid.UUID, environment_id: uuid.UUID, data: EnvironmentUpdate) -> Environment:
        environment = await self.get(project_id, environment_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(environment, field, value)
        return environment

    async def delete(self, project_id: uuid.UUID, environment_id: uuid.UUID) -> None:
        environment = await self.get(project_id, environment_id)
        await self._environments.delete(environment)
        logger.info("deleted environment %s (%s)", environment.slug, environment.id)
