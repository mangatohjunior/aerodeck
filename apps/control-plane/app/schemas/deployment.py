import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.github import parse_github_repo
from app.models.deployment import DeploymentStatus

RepoUrl = Annotated[str, Field(min_length=1, max_length=512)]


class DeploymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_url: RepoUrl
    project_id: uuid.UUID | None = None
    environment_id: uuid.UUID | None = None

    @field_validator("repo_url")
    @classmethod
    def github_repository(cls, value: str) -> str:
        if parse_github_repo(value) is None:
            raise ValueError("repo_url must be an http(s)://github.com/{owner}/{repo} URL")
        return value

    @model_validator(mode="after")
    def linked_pair(self) -> Self:
        if (self.project_id is None) ^ (self.environment_id is None):
            raise ValueError("project_id and environment_id must both be set or both omitted")
        return self


class DeploymentRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    repo_url: str
    owner: str
    repo: str
    project_id: uuid.UUID | None
    environment_id: uuid.UUID | None
    provision_job_id: uuid.UUID | None
    status: DeploymentStatus
    started_at: datetime
    created_at: datetime
    updated_at: datetime
