import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.services.provisioning import JobKind

JobStatusValue = Literal["queued", "running", "retrying", "succeeded", "failed"]


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
