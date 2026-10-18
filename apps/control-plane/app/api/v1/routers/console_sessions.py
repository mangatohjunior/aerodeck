from fastapi import APIRouter, status

from app.api.deps import ConsoleSessionServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.console_session import ConsoleSessionCreate, ConsoleSessionIssued, ConsoleSessionToken
from app.schemas.console_user import ConsoleUserRead

router = APIRouter(prefix="/console-sessions", tags=["console-sessions"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.post(
    "",
    response_model=ConsoleSessionIssued,
    status_code=status.HTTP_201_CREATED,
    summary="Open a console session",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def open_console_session(body: ConsoleSessionCreate, sessions: ConsoleSessionServiceDep) -> ConsoleSessionIssued:
    token, user = await sessions.open(body.user_id)
    return ConsoleSessionIssued(token=token, user=ConsoleUserRead.model_validate(user))


@router.post(
    "/resolve",
    response_model=ConsoleUserRead,
    summary="Read the user for a console session",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def resolve_console_session(body: ConsoleSessionToken, sessions: ConsoleSessionServiceDep) -> ConsoleUserRead:
    return ConsoleUserRead.model_validate(await sessions.resolve(body.token))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a console session",
    responses=_UNAUTHENTICATED,
)
async def logout_console_session(body: ConsoleSessionToken, sessions: ConsoleSessionServiceDep) -> None:
    await sessions.revoke(body.token)
