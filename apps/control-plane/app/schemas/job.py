import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.services.provisioning import JobKind

JobStatusValue = Literal["queued", "running", "retrying", "succeeded", "failed"]


class ProvisionJobCreate(BaseModel):
    """Optional body for ``POST .../provision``. Links the job to a console deployment."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    deployment_id: uuid.UUID | None = Field(
        default=None,
        description="When set, the worker publishes progress lines for this deployment's log stream.",
    )


class JobAccepted(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: uuid.UUID
    kind: JobKind
    project_id: uuid.UUID
    environment_id: uuid.UUID
    status: JobStatusValue = "queued"


class JobRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: uuid.UUID
    status: JobStatusValue
    result: dict[str, str | bool] | None = None
    error: str | None = None
