import uuid

from fastapi import APIRouter, status

from app.api.deps import CertificateServiceDep, PaginationDep, RouteServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.certificate import CertificateRead
from app.schemas.common import Page
from app.schemas.dns_record import DnsRecordRead
from app.schemas.route import RouteCreate, RouteRead, RouteUpdate

router = APIRouter(prefix="/projects/{project_id}/routes", tags=["routes"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get(
    "",
    response_model=Page[RouteRead],
    status_code=status.HTTP_200_OK,
    summary="List a project's Traefik routes",
    responses=_NOT_FOUND,
)
async def list_routes(project_id: uuid.UUID, page: PaginationDep, routes: RouteServiceDep) -> Page[RouteRead]:
    items, total = await routes.list(project_id, limit=page.limit, offset=page.offset)
    return Page(
        items=[RouteRead.model_validate(item) for item in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "",
    response_model=RouteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Declare a hostname routed through Traefik",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def create_route(project_id: uuid.UUID, body: RouteCreate, routes: RouteServiceDep) -> RouteRead:
    return RouteRead.model_validate(await routes.create(project_id, body))


@router.get(
    "/{route_id}",
    response_model=RouteRead,
    status_code=status.HTTP_200_OK,
    summary="Get a route",
    responses=_NOT_FOUND,
)
async def get_route(project_id: uuid.UUID, route_id: uuid.UUID, routes: RouteServiceDep) -> RouteRead:
    return RouteRead.model_validate(await routes.get(project_id, route_id))


@router.patch(
    "/{route_id}",
    response_model=RouteRead,
    status_code=status.HTTP_200_OK,
    summary="Update a route",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def update_route(
    project_id: uuid.UUID, route_id: uuid.UUID, body: RouteUpdate, routes: RouteServiceDep
) -> RouteRead:
    return RouteRead.model_validate(await routes.update(project_id, route_id, body))


@router.delete(
    "/{route_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a route",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def delete_route(project_id: uuid.UUID, route_id: uuid.UUID, routes: RouteServiceDep) -> None:
    await routes.delete(project_id, route_id)


@router.get(
    "/{route_id}/dns",
    response_model=DnsRecordRead,
    status_code=status.HTTP_200_OK,
    summary="Get the public DNS record for a route",
    responses=_NOT_FOUND,
)
async def get_route_dns(project_id: uuid.UUID, route_id: uuid.UUID, routes: RouteServiceDep) -> DnsRecordRead:
    return DnsRecordRead.model_validate(await routes.dns_record(project_id, route_id))


@router.get(
    "/{route_id}/certificate",
    response_model=CertificateRead,
    status_code=status.HTTP_200_OK,
    summary="Get the TLS certificate for a route",
    responses=_NOT_FOUND,
)
async def get_certificate(
    project_id: uuid.UUID, route_id: uuid.UUID, certificates: CertificateServiceDep
) -> CertificateRead:
    return CertificateRead.model_validate(await certificates.get(project_id, route_id))


@router.post(
    "/{route_id}/certificate/issue",
    response_model=CertificateRead,
    status_code=status.HTTP_200_OK,
    summary="Issue a certificate via DNS-01",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def issue_certificate(
    project_id: uuid.UUID, route_id: uuid.UUID, certificates: CertificateServiceDep
) -> CertificateRead:
    return CertificateRead.model_validate(await certificates.issue(project_id, route_id))


@router.post(
    "/{route_id}/certificate/renew",
    response_model=CertificateRead,
    status_code=status.HTTP_200_OK,
    summary="Renew a certificate via DNS-01",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def renew_certificate(
    project_id: uuid.UUID, route_id: uuid.UUID, certificates: CertificateServiceDep
) -> CertificateRead:
    return CertificateRead.model_validate(await certificates.renew(project_id, route_id))
