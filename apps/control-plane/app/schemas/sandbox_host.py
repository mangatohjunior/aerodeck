import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.sandbox_host import SandboxHostStatus
from app.schemas.common import Slug

ApiUrl = Annotated[str, Field(min_length=8, max_length=253)]


class SandboxHostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Slug
    api_url: ApiUrl

    @field_validator("api_url")
    @classmethod
    def _http_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("api_url must be an http or https URL")
        return value.rstrip("/")


class SandboxHostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    api_url: ApiUrl | None = None
    status: SandboxHostStatus | None = None

    @field_validator("api_url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.startswith(("http://", "https://")):
            raise ValueError("api_url must be an http or https URL")
        return value.rstrip("/")


class SandboxHostRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    name: str
    api_url: str
    status: SandboxHostStatus
    created_at: datetime
    updated_at: datetime
