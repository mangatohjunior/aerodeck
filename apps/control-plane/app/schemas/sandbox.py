import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models.sandbox import SandboxStatus

ImageName = Annotated[
    str,
    Field(
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
        description="Declared guest image name (directory under the image root, no path separators).",
    ),
]
VcpuCount = Annotated[int, Field(ge=1, le=8)]
MemoryMib = Annotated[int, Field(ge=32, le=4096)]


class SandboxCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    image: ImageName
    vcpu: VcpuCount = 1
    memory_mib: MemoryMib = 128


class SandboxRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    image: str
    vcpu: int
    memory_mib: int
    status: SandboxStatus
    created_at: datetime
    updated_at: datetime
