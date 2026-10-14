from fastapi import APIRouter, status

from app.api.deps import EdgeReaderDep, RouteServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.route import TraefikConfiguration

router = APIRouter(prefix="/edge", tags=["edge"])


@router.get(
    "/traefik",
    response_model=TraefikConfiguration,
    status_code=status.HTTP_200_OK,
    summary="Traefik HTTP provider snapshot",
    description=(
        "Dynamic configuration Traefik polls. Disabled routes are omitted. "
        "Authenticate with a control-plane token or AERODECK_TRAEFIK_PROVIDER_TOKEN."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
)
async def traefik_configuration(routes: RouteServiceDep, _: EdgeReaderDep) -> TraefikConfiguration:
    return await routes.traefik_configuration()
