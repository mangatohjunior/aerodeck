import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

Hostname = Annotated[
    str,
    Field(
        min_length=1,
        max_length=253,
        pattern=r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$",
    ),
]
BackendHost = Annotated[
    str,
    Field(min_length=1, max_length=253, pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$"),
]
PathPrefix = Annotated[str, Field(min_length=1, max_length=200)]
Entrypoint = Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[a-z0-9][a-z0-9-]*$")]
Port = Annotated[int, Field(ge=1, le=65535)]


class RouteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    environment_id: uuid.UUID
    hostname: Hostname
    path_prefix: PathPrefix = "/"
    backend_host: BackendHost
    backend_port: Port
    entrypoint: Entrypoint = "web"
    enabled: bool = True

    @field_validator("hostname")
    @classmethod
    def _lowercase_hostname(cls, value: str) -> str:
        return value.lower()

    @field_validator("path_prefix")
    @classmethod
    def _normalise_path_prefix(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError("path_prefix must start with /")
        if len(value) > 1:
            return value.rstrip("/")
        return value


class RouteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    hostname: Hostname | None = None
    path_prefix: PathPrefix | None = None
    backend_host: BackendHost | None = None
    backend_port: Port | None = None
    entrypoint: Entrypoint | None = None
    enabled: bool | None = None

    @field_validator("hostname")
    @classmethod
    def _lowercase_hostname(cls, value: str | None) -> str | None:
        return value.lower() if value is not None else value

    @field_validator("path_prefix")
    @classmethod
    def _normalise_path_prefix(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.startswith("/"):
            raise ValueError("path_prefix must start with /")
        if len(value) > 1:
            return value.rstrip("/")
        return value


class RouteRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    environment_id: uuid.UUID
    hostname: str
    path_prefix: str
    backend_host: str
    backend_port: int
    entrypoint: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


class TraefikServer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str


class TraefikLoadBalancer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    servers: list[TraefikServer]


class TraefikService(BaseModel):
    model_config = ConfigDict(extra="forbid")

    loadBalancer: TraefikLoadBalancer


class TraefikRouter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: str
    service: str
    entryPoints: list[str]


class TraefikHttp(BaseModel):
    model_config = ConfigDict(extra="forbid")

    routers: dict[str, TraefikRouter]
    services: dict[str, TraefikService]


class TraefikConfiguration(BaseModel):
    """Traefik v3 HTTP provider payload. Field names match Traefik's JSON contract."""

    model_config = ConfigDict(extra="forbid")

    http: TraefikHttp
