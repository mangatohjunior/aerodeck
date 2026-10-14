"""Aggregates every v1 resource router under ``/api/v1``.

Resource routers are included with ``MUTATION_GUARD`` so POST/PUT/PATCH/DELETE
require a bearer token issued by ``/api/v1/auth/token``::

    api_v1_router.include_router(projects.router, dependencies=MUTATION_GUARD)

The auth router is the one exception: it has to accept the request that
obtains a token in the first place. Its ``/me`` route protects itself.
"""

from fastapi import APIRouter

from app.api.v1.routers import auth

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
