import uuid
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.project import Project
from app.repositories.projects import ProjectRepository
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.deployment_links import DeploymentProjectLinkClearer

logger = get_logger("services.projects")


class ProjectService:
    def __init__(
        self, projects: ProjectRepository, deployments: DeploymentProjectLinkClearer
    ) -> None:
        self._projects = projects
        self._deployments = deployments

    async def create(self, data: ProjectCreate) -> Project:
        if await self._projects.get_by_slug(data.slug) is not None:
            raise ConflictError(f"Project slug {data.slug!r} is already taken")
        try:
            project = await self._projects.add(Project(**data.model_dump()))
        except IntegrityError as exc:
            # Lost a race with a concurrent create of the same slug.
            raise ConflictError(f"Project slug {data.slug!r} is already taken") from exc
        logger.info("created project %s (%s)", project.slug, project.id)
        return project

    async def get(self, project_id: uuid.UUID) -> Project:
        project = await self._projects.get(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found")
        return project

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[Project], int]:
        return await self._projects.list(limit=limit, offset=offset)

    async def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        project = await self.get(project_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(project, field, value)
        return project

    async def delete(self, project_id: uuid.UUID) -> None:
        project = await self.get(project_id)
        # Clear both columns before cascade removes environments so the pair
        # invariant holds without relying on composite ON DELETE SET NULL alone.
        await self._deployments.clear_project_link(project.id)
        await self._projects.delete(project)
        logger.info("deleted project %s (%s)", project.slug, project.id)
