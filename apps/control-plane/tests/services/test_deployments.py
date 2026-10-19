import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.errors import NotFoundError
from app.models.deployment import DEPLOYMENT_ENVIRONMENT_FK
from app.schemas.deployment import DeploymentCreate
from app.services.deployment_terminal import DeploymentTerminalService
from app.services.deployments import DeploymentService

REPO = "https://github.com/mangatohjunior/aerodeck"


@pytest.mark.asyncio
async def test_create_maps_named_fk_integrity_error_to_not_found() -> None:
    project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    deployments = AsyncMock()
    deployments.add = AsyncMock(
        side_effect=IntegrityError(
            "INSERT",
            {},
            Exception(f'insert or update on table "deployments" violates foreign key constraint "{DEPLOYMENT_ENVIRONMENT_FK}"'),
        )
    )
    environments = AsyncMock()
    environments.get = AsyncMock(return_value=object())
    service = DeploymentService(
        deployments, environments, DeploymentTerminalService(deployments)
    )

    with pytest.raises(NotFoundError, match=str(environment_id)):
        await service.create(
            DeploymentCreate(
                repo_url=REPO, project_id=project_id, environment_id=environment_id
            )
        )


@pytest.mark.asyncio
async def test_create_maps_sqlite_fk_integrity_error_to_not_found() -> None:
    class _SqliteIntegrity(Exception):
        __module__ = "sqlite3"

    project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    deployments = AsyncMock()
    deployments.add = AsyncMock(
        side_effect=IntegrityError("INSERT", {}, _SqliteIntegrity("FOREIGN KEY constraint failed"))
    )
    environments = AsyncMock()
    environments.get = AsyncMock(return_value=object())
    service = DeploymentService(
        deployments, environments, DeploymentTerminalService(deployments)
    )

    with pytest.raises(NotFoundError, match=str(environment_id)):
        await service.create(
            DeploymentCreate(
                repo_url=REPO, project_id=project_id, environment_id=environment_id
            )
        )


@pytest.mark.asyncio
async def test_create_reraises_unrelated_integrity_error() -> None:
    project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    deployments = AsyncMock()
    deployments.add = AsyncMock(
        side_effect=IntegrityError("INSERT", {}, Exception("unique constraint uq_other"))
    )
    environments = AsyncMock()
    environments.get = AsyncMock(return_value=object())
    service = DeploymentService(
        deployments, environments, DeploymentTerminalService(deployments)
    )

    with pytest.raises(IntegrityError):
        await service.create(
            DeploymentCreate(
                repo_url=REPO, project_id=project_id, environment_id=environment_id
            )
        )
