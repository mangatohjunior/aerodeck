"""AeroDeck Control Plane — ASGI entrypoint.

This module only wires the application together (settings, lifespan, health
endpoints, versioned API router). Business routes live under ``app/api/v1``
per ``.cursor/rules/fastapi-architecture.mdc``.

Run locally:
    uvicorn main:app --reload --port 8000
"""

from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import APIRouter, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.api.deps import SettingsDep
from app.api.v1.router import api_v1_router
from app.core.config import Settings, get_settings
from app.core.db import bind_engine, create_engine, ping, unbind_engine
from app.core.errors import AppError
from app.core.logging import configure_logging, get_logger
from app.core.queue import ping_broker
from app.schemas.auth import ErrorResponse

logger = get_logger("control_plane")

# --------------------------------------------------------------------------- #
# Health schemas
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


# --------------------------------------------------------------------------- #
# Lifespan — create/dispose long-lived resources here (DB engine, HTTP clients)
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    configure_logging(settings.log_level)
    logger.info("starting %s v%s (env=%s)", settings.app_name, settings.version, settings.env)

    engine = create_engine(settings.database_url) if settings.database_url else None
    app.state.engine = engine
    if engine is not None:
        bind_engine(engine)
    else:
        logger.warning("AERODECK_DATABASE_URL is unset; routes that need the database will return 503")

    try:
        yield
    finally:
        unbind_engine()
        if engine is not None:
            await engine.dispose()
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
async def readyz(request: Request, settings: SettingsDep) -> JSONResponse:
    checks: dict[str, Literal["ok", "failed", "skipped"]] = {}

    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        checks["database"] = "skipped"
    else:
        try:
            await ping(engine)
            checks["database"] = "ok"
        except Exception:
            logger.exception("database readiness check failed")
            checks["database"] = "failed"

    if settings.redis_url is None:
        checks["queue"] = "skipped"
    else:
        try:
            await ping_broker(settings.redis_url)
            checks["queue"] = "ok"
        except Exception:
            logger.exception("queue readiness check failed")
            checks["queue"] = "failed"

    ready = all(v != "failed" for v in checks.values())
    payload = ReadinessResponse(status="ready" if ready else "degraded", checks=checks)
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=payload.model_dump(),
    )


# --------------------------------------------------------------------------- #
# Application factory
# --------------------------------------------------------------------------- #


def _error_response(
    status_code: int, detail: str, code: str, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(detail=detail, code=code).model_dump(),
        headers=dict(headers) if headers else None,
    )


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
    # Dependencies read settings via get_settings(); lifespan reads this so an
    # injected Settings (tests, tooling) is honoured everywhere.
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.status_code, exc.detail, exc.code, exc.headers)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return _error_response(exc.status_code, str(exc.detail), f"http_{exc.status_code}", exc.headers)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return _error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error", "internal_error")

    app.include_router(health_router)
    app.include_router(api_v1_router)
    return app


app = create_app()
