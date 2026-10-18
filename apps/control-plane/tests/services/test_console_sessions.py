"""An expired session is the same as an unknown one."""

import uuid
from datetime import UTC, datetime, timedelta

from app.core.errors import NotFoundError
from app.models.console_session import ConsoleSession
from app.models.console_user import ConsoleUser
from app.services.console_sessions import ConsoleSessionService

TOKEN = "session-token-value"


class _Sessions:
    def __init__(self, stored: ConsoleSession | None) -> None:
        self.stored = stored
        self.deleted = False

    async def get_by_token_hash(self, token_hash: str) -> ConsoleSession | None:
        if self.deleted:
            return None
        return self.stored

    async def delete(self, stored: ConsoleSession) -> None:
        self.deleted = True

    async def add(self, stored: ConsoleSession) -> ConsoleSession:
        return stored


class _Users:
    async def get(self, user_id: object) -> None:
        return None


async def test_expired_session_matches_unknown() -> None:
    user = ConsoleUser(id=uuid.uuid4(), email="ada@example.com", password_hash="scrypt$stored")
    expired = ConsoleSession(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash="stored-hash",
        expires_at=datetime.now(UTC) - timedelta(seconds=1),
        user=user,
    )
    service = ConsoleSessionService(_Sessions(expired), _Users())  # type: ignore[arg-type]
    missing = ConsoleSessionService(_Sessions(None), _Users())  # type: ignore[arg-type]

    try:
        await service.resolve(TOKEN)
    except NotFoundError as expired_error:
        expired_detail = expired_error.detail
    else:
        raise AssertionError("expected a missing session")

    try:
        await missing.resolve(TOKEN)
    except NotFoundError as missing_error:
        missing_detail = missing_error.detail
    else:
        raise AssertionError("expected a missing session")

    assert expired_detail == missing_detail == "Not signed in"
    assert TOKEN not in expired_detail
