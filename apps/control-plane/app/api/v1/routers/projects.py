import uuid

from fastapi import APIRouter, status

from app.api.deps import PaginationDep, ProjectServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get("", response_model=Page[ProjectRead], status_code=status.HTTP_200_OK, summary="List projects")
async def list_projects(page: PaginationDep, projects: ProjectServiceDep) -> Page[ProjectRead]:
    items, total = await projects.list(limit=page.limit, offset=page.offset)
    return Page(
        items=[ProjectRead.model_validate(p) for p in items], total=total, limit=page.limit, offset=page.offset
    )


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
    responses=_UNAUTHENTICATED | _CONFLICT,
)
async def create_project(body: ProjectCreate, projects: ProjectServiceDep) -> ProjectRead:
    return ProjectRead.model_validate(await projects.create(body))


@router.get(
    "/{project_id}",
    response_model=ProjectRead,
    status_code=status.HTTP_200_OK,
    summary="Get a project",
    responses=_NOT_FOUND,
)
async def get_project(project_id: uuid.UUID, projects: ProjectServiceDep) -> ProjectRead:
    return ProjectRead.model_validate(await projects.get(project_id))


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    status_code=status.HTTP_200_OK,
    summary="Update a project",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def update_project(project_id: uuid.UUID, body: ProjectUpdate, projects: ProjectServiceDep) -> ProjectRead:
    return ProjectRead.model_validate(await projects.update(project_id, body))


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project and its environments",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def delete_project(project_id: uuid.UUID, projects: ProjectServiceDep) -> None:
    await projects.delete(project_id)
