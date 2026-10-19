"""Narrow protocols for clearing deployment ↔ environment links on delete."""

import uuid
from typing import Protocol


class DeploymentProjectLinkClearer(Protocol):
    async def clear_project_link(self, project_id: uuid.UUID) -> None: ...


class DeploymentEnvironmentLinkClearer(Protocol):
    async def clear_environment_link(self, environment_id: uuid.UUID) -> None: ...
