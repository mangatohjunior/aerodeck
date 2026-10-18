from fastapi import APIRouter, status

from app.api.deps import ConsoleUserServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.console_user import ConsoleUserCreate, ConsoleUserRead

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
