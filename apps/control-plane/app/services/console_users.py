from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError
from app.core.logging import get_logger
from app.core.security import hash_password
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
