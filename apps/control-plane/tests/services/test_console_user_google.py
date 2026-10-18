"""Google linking maps a lost unique-constraint race to a conflict."""

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError
from app.models.console_user import ConsoleUser
from app.schemas.console_user import ConsoleUserGoogleLink
from app.services.console_users import ConsoleUserService


class _RacingUsers:
    def __init__(self) -> None:
        self.user = ConsoleUser(email="ada@example.com", password_hash="scrypt$stored", google_subject=None)

    async def get_by_subject(self, subject: str) -> None:
        return None

    async def get_by_email(self, email: str) -> ConsoleUser:
        return self.user

    async def save(self, user: ConsoleUser) -> ConsoleUser:
        raise IntegrityError("UPDATE console_users", {}, Exception("unique"))

    async def add(self, user: ConsoleUser) -> ConsoleUser:
        raise AssertionError("attach must not insert a second row")


async def test_attach_unique_race_is_a_conflict() -> None:
    service = ConsoleUserService(_RacingUsers())  # type: ignore[arg-type]

    try:
        await service.link_google(ConsoleUserGoogleLink(email="ada@example.com", subject="google-subject-1"))
    except ConflictError as exc:
        assert exc.detail == "Google account is already linked"
        assert "google-subject-1" not in exc.detail
    else:
        raise AssertionError("expected a conflict")
