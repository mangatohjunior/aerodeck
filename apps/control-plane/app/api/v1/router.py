"""Aggregates every v1 resource router under ``/api/v1``.

Resource routers are included with ``MUTATION_GUARD`` so POST/PUT/PATCH/DELETE
require a bearer token issued by ``/api/v1/auth/token``.

The auth router is the one exception: it has to accept the request that
obtains a token in the first place. Its ``/me`` route protects itself.
"""

from fastapi import APIRouter

from app.api.deps import MUTATION_GUARD
from app.api.v1.routers import auth, edge, environments, jobs, projects, routes

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(projects.router, dependencies=MUTATION_GUARD)
api_v1_router.include_router(environments.router, dependencies=MUTATION_GUARD)
api_v1_router.include_router(routes.router, dependencies=MUTATION_GUARD)
api_v1_router.include_router(edge.router)
api_v1_router.include_router(jobs.router)
