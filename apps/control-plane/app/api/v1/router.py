"""Aggregates every v1 resource router under ``/api/v1``.

Resource routers are included with ``AUTH_GUARD`` so every method needs a
bearer token from ``/api/v1/auth/token``. ``/healthz`` and ``/readyz`` stay
open. Traefik's snapshot accepts that token or ``AERODECK_TRAEFIK_PROVIDER_TOKEN``.

The auth router is the one exception: it has to accept the request that
obtains a token in the first place. Its ``/me`` route protects itself.
"""

from fastapi import APIRouter

from app.api.deps import AUTH_GUARD
from app.api.v1.routers import (
    auth,
    console_sessions,
    console_users,
    deployments,
    edge,
    environments,
    jobs,
    projects,
    routes,
    sandbox_hosts,
    sandboxes,
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(console_users.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(console_sessions.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(projects.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(environments.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(routes.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(sandboxes.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(sandboxes.platform_router, dependencies=AUTH_GUARD)
api_v1_router.include_router(sandbox_hosts.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(edge.router)
api_v1_router.include_router(jobs.router, dependencies=AUTH_GUARD)
api_v1_router.include_router(deployments.router, dependencies=AUTH_GUARD)
