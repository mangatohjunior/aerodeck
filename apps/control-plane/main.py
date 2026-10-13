"""AeroDeck Control Plane — ASGI entrypoint.

This module only wires the application together (settings, lifespan, health
endpoints, versioned API router). Business routes live under ``app/api/v1``
per ``.cursor/rules/fastapi-architecture.mdc``.

Run locally:
    uvicorn main:app --reload --port 8000
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("aerodeck.control_plane")

# --------------------------------------------------------------------------- #
# Settings (the ONLY place environment variables are read)
# --------------------------------------------------------------------------- #


class Settings(BaseSettings):
    """Runtime configuration, loaded from ``AERODECK_*`` env vars or ``.env``."""

    model_config = SettingsConfigDict(
        env_prefix="AERODECK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AeroDeck Control Plane"
    version: str = "0.1.0"
    env: Literal["local", "dev", "staging", "production"] = "local"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Explicit allow-list; wildcard is only tolerated for local development.
    cors_origins: list[str] = Field(default_factory=list)

    # Async SQLAlchemy URL, e.g. postgresql+asyncpg://user:pass@host:5432/aerodeck
    # Optional at this stage; the readiness probe reports "skipped" when unset.
    database_url: str | None = None

    @property
    def docs_enabled(self) -> bool:
        return self.env != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, Depends(get_settings)]

# --------------------------------------------------------------------------- #
# Schemas (Pydantic V2)
# --------------------------------------------------------------------------- #


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: str
    version: str
    env: str


class ReadinessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "degraded"]
    checks: dict[str, Literal["ok", "failed", "skipped"]]


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: str
    code: str


# --------------------------------------------------------------------------- #
# Lifespan — create/dispose long-lived resources here (DB engine, HTTP clients)
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger.info("starting %s v%s (env=%s)", settings.app_name, settings.version, settings.env)

    # TODO(control-plane): initialise the async SQLAlchemy engine in app/core/db.py
    # and store it on app.state.engine; dispose it after yield.
    app.state.settings = settings
    try:
        yield
    finally:
        logger.info("shutting down %s", settings.app_name)


# --------------------------------------------------------------------------- #
# Health / readiness (unauthenticated, not versioned)
# --------------------------------------------------------------------------- #

health_router = APIRouter(tags=["health"])


@health_router.get(
    "/healthz",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Liveness probe",
)
async def healthz(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(service=settings.app_name, version=settings.version, env=settings.env)


@health_router.get(
    "/readyz",
    response_model=ReadinessResponse,
    status_code=status.HTTP_200_OK,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessResponse}},
    summary="Readiness probe",
)
async def readyz(settings: SettingsDep) -> JSONResponse:
    checks: dict[str, Literal["ok", "failed", "skipped"]] = {}

    # TODO(control-plane): replace with a real `SELECT 1` through the async
    # session dependency once app/core/db.py exists.
    checks["database"] = "skipped" if settings.database_url is None else "ok"

    ready = all(v != "failed" for v in checks.values())
    payload = ReadinessResponse(status="ready" if ready else "degraded", checks=checks)
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=payload.model_dump(),
    )


# --------------------------------------------------------------------------- #
# Versioned API surface — mount feature routers here (app/api/v1/router.py)
# --------------------------------------------------------------------------- #

api_v1_router = APIRouter(prefix="/api/v1")

# --------------------------------------------------------------------------- #
# Application factory
# --------------------------------------------------------------------------- #


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description="Declarative, GitOps-driven infrastructure orchestration API.",
        lifespan=lifespan,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        responses={
            # Literal 422: the Starlette constant was renamed between versions.
            422: {"model": ErrorResponse},
            status.HTTP_500_INTERNAL_SERVER_ERROR: {"model": ErrorResponse},
        },
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(detail="Internal server error", code="internal_error").model_dump(),
        )

    app.include_router(health_router)
    app.include_router(api_v1_router)
    return app


app = create_app()
