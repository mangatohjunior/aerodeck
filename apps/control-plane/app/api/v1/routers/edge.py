from fastapi import APIRouter, status

from app.api.deps import CertificateServiceDep, EdgeReaderDep, MUTATION_GUARD, RouteServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.certificate import CertificateRead
from app.schemas.route import TraefikConfiguration

router = APIRouter(prefix="/edge", tags=["edge"])

_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get(
    "/traefik",
    response_model=TraefikConfiguration,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
    summary="Traefik HTTP provider snapshot",
    description=(
        "Dynamic configuration Traefik polls. Disabled routes are omitted. "
        "Issued certificates appear under tls.certificates. "
        "Authenticate with a control-plane token or AERODECK_TRAEFIK_PROVIDER_TOKEN."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
)
async def traefik_configuration(routes: RouteServiceDep, _: EdgeReaderDep) -> TraefikConfiguration:
    return await routes.traefik_configuration()


@router.post(
    "/certificates/renew-due",
    response_model=list[CertificateRead],
    status_code=status.HTTP_200_OK,
    summary="Renew certificates that expire within the configured window",
    dependencies=MUTATION_GUARD,
    responses=_UNAUTHENTICATED,
)
async def renew_due_certificates(certificates: CertificateServiceDep) -> list[CertificateRead]:
    return [CertificateRead.model_validate(item) for item in await certificates.renew_due()]
