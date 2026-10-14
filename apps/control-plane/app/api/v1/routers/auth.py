from fastapi import APIRouter, status

from app.api.deps import AuthServiceDep, ClientDep
from app.schemas.auth import ClientRead, ErrorResponse, TokenRead, TokenRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/token",
    response_model=TokenRead,
    status_code=status.HTTP_200_OK,
    summary="Exchange client credentials for a short-lived access token",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}},
)
async def issue_token(body: TokenRequest, auth: AuthServiceDep) -> TokenRead:
    issued = await auth.issue_token(body.client_id, body.client_secret)
    return TokenRead(
        access_token=issued.access_token,
        expires_in=issued.expires_in,
        expires_at=issued.expires_at,
    )


@router.get(
    "/me",
    response_model=ClientRead,
    status_code=status.HTTP_200_OK,
    summary="Identify the client behind the presented token",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}},
)
async def whoami(client: ClientDep) -> ClientRead:
    return ClientRead(client_id=client.client_id, token_id=client.token_id, expires_at=client.expires_at)
