from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, InvalidCredentialsError
from app.core.logging import get_logger
from app.core.security import dummy_password_hash, hash_password, verify_password
from app.models.console_user import ConsoleUser
from app.repositories.console_users import ConsoleUserRepository
from app.schemas.console_user import ConsoleUserCreate

logger = get_logger("services.console_users")


class ConsoleUserService:
    def __init__(self, users: ConsoleUserRepository) -> None:
        self._users = users

    async def register(self, data: ConsoleUserCreate) -> ConsoleUser:
        if await self._users.get_by_email(data.email) is not None:
            raise ConflictError("Email is already registered")
        user = ConsoleUser(email=data.email, password_hash=hash_password(data.password))
        try:
            stored = await self._users.add(user)
        except IntegrityError as exc:
            raise ConflictError("Email is already registered") from exc
        logger.info("registered console user %s", stored.id)
        return stored

    async def authenticate(self, data: ConsoleUserCreate) -> ConsoleUser:
        user = await self._users.get_by_email(data.email)
        stored = user.password_hash if user is not None else dummy_password_hash()
        password_matches = verify_password(data.password, stored)
        if user is None or not password_matches:
            raise InvalidCredentialsError("Invalid email or password")
        logger.info("console user signed in %s", user.id)
        return user
