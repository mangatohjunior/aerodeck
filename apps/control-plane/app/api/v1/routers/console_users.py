from fastapi import APIRouter, status

from app.api.deps import ConsoleUserServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.console_user import ConsoleUserCreate, ConsoleUserGoogleLink, ConsoleUserRead

router = APIRouter(prefix="/console-users", tags=["console-users"])

_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.post(
    "",
    response_model=ConsoleUserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a console user",
    responses=_UNAUTHENTICATED | _CONFLICT,
)
async def register_console_user(body: ConsoleUserCreate, users: ConsoleUserServiceDep) -> ConsoleUserRead:
    return ConsoleUserRead.model_validate(await users.register(body))


@router.post(
    "/login",
    response_model=ConsoleUserRead,
    summary="Sign in a console user",
    responses=_UNAUTHENTICATED,
)
async def login_console_user(body: ConsoleUserCreate, users: ConsoleUserServiceDep) -> ConsoleUserRead:
    return ConsoleUserRead.model_validate(await users.authenticate(body))


@router.post(
    "/google",
    response_model=ConsoleUserRead,
    summary="Link a verified Google subject to a console user",
    responses=_UNAUTHENTICATED | _CONFLICT,
)
async def link_google_console_user(body: ConsoleUserGoogleLink, users: ConsoleUserServiceDep) -> ConsoleUserRead:
    return ConsoleUserRead.model_validate(await users.link_google(body))
