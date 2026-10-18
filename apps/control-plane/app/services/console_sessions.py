import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_client_secret
from app.models.console_session import ConsoleSession
from app.models.console_user import ConsoleUser
from app.repositories.console_sessions import ConsoleSessionRepository
from app.repositories.console_users import ConsoleUserRepository

logger = get_logger("services.console_sessions")

SESSION_TTL = timedelta(days=7)


class ConsoleSessionService:
    def __init__(self, sessions: ConsoleSessionRepository, users: ConsoleUserRepository) -> None:
        self._sessions = sessions
        self._users = users

    async def open(self, user_id: uuid.UUID) -> tuple[str, ConsoleUser]:
        user = await self._users.get(user_id)
        if user is None:
            raise NotFoundError("Console user not found")
        token = secrets.token_urlsafe(32)
        try:
            await self._sessions.add(
                ConsoleSession(
                    user_id=user.id,
                    token_hash=hash_client_secret(token),
                    expires_at=datetime.now(UTC) + SESSION_TTL,
                )
            )
        except IntegrityError as exc:
            raise ConflictError("Console session could not be opened") from exc
        logger.info("opened console session for user %s", user.id)
        return token, user

    async def resolve(self, token: str, *, now: datetime | None = None) -> ConsoleUser:
        current = now or datetime.now(UTC)
        stored = await self._sessions.get_by_token_hash(hash_client_secret(token))
        if stored is None or _as_utc(stored.expires_at) <= current:
            if stored is not None:
                await self._sessions.delete(stored)
            raise NotFoundError("Not signed in")
        return stored.user

    async def revoke(self, token: str) -> None:
        stored = await self._sessions.get_by_token_hash(hash_client_secret(token))
        if stored is None:
            return
        await self._sessions.delete(stored)
        logger.info("revoked console session for user %s", stored.user_id)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
