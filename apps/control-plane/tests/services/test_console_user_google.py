"""Google linking maps a lost unique-constraint race to the matching outcome."""

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError
from app.models.console_user import ConsoleUser
from app.schemas.console_user import ConsoleUserGoogleLink
from app.services.console_users import ConsoleUserService

SUBJECT = "google-subject-1"


class _AttachRace:
    async def get_by_subject(self, subject: str) -> None:
        return None

    async def get_by_email(self, email: str) -> ConsoleUser:
        return ConsoleUser(email=email, password_hash="scrypt$stored", google_subject=None)

    async def add(self, user: ConsoleUser) -> ConsoleUser:
        raise IntegrityError("UPDATE console_users", {}, Exception("unique"))


class _InsertRace:
    """The first lookup misses. The insert then loses, and the row is visible."""

    def __init__(self, existing: ConsoleUser) -> None:
        self.existing = existing
        self.failed = False

    async def get_by_subject(self, subject: str) -> ConsoleUser | None:
        if self.failed and self.existing.google_subject == subject:
            return self.existing
        return None

    async def get_by_email(self, email: str) -> ConsoleUser | None:
        if self.failed and self.existing.email == email:
            return self.existing
        return None

    async def add(self, user: ConsoleUser) -> ConsoleUser:
        if not self.failed:
            self.failed = True
            raise IntegrityError("INSERT console_users", {}, Exception("unique"))
        return user


def _link(email: str = "ada@example.com") -> ConsoleUserGoogleLink:
    return ConsoleUserGoogleLink(email=email, subject=SUBJECT)


async def test_attach_unique_race_is_a_conflict() -> None:
    service = ConsoleUserService(_AttachRace())  # type: ignore[arg-type]

    try:
        await service.link_google(_link())
    except ConflictError as exc:
        assert exc.detail == "Google account is already linked"
        assert SUBJECT not in exc.detail
    else:
        raise AssertionError("expected a conflict")


async def test_insert_race_returns_the_same_google_account() -> None:
    existing = ConsoleUser(email="ada@example.com", password_hash=None, google_subject=SUBJECT)
    service = ConsoleUserService(_InsertRace(existing))  # type: ignore[arg-type]

    stored = await service.link_google(_link())

    assert stored is existing


async def test_insert_race_on_an_existing_email_matches_register() -> None:
    existing = ConsoleUser(email="ada@example.com", password_hash="scrypt$stored", google_subject="other-subject")
    service = ConsoleUserService(_InsertRace(existing))  # type: ignore[arg-type]

    try:
        await service.link_google(_link())
    except ConflictError as exc:
        assert exc.detail == "Email is already registered"
        assert SUBJECT not in exc.detail
        assert "other-subject" not in exc.detail
    else:
        raise AssertionError("expected a conflict")


async def test_insert_race_on_a_taken_subject_stays_a_google_conflict() -> None:
    existing = ConsoleUser(email="other@example.com", password_hash=None, google_subject=SUBJECT)
    service = ConsoleUserService(_InsertRace(existing))  # type: ignore[arg-type]

    try:
        await service.link_google(_link())
    except ConflictError as exc:
        assert exc.detail == "Google account is already linked"
        assert SUBJECT not in exc.detail
        assert "other@example.com" not in exc.detail
    else:
        raise AssertionError("expected a conflict")


async def test_insert_race_attaches_when_the_email_has_no_subject() -> None:
    existing = ConsoleUser(email="ada@example.com", password_hash="scrypt$stored", google_subject=None)
    service = ConsoleUserService(_InsertRace(existing))  # type: ignore[arg-type]

    stored = await service.link_google(_link())

    assert stored is existing
    assert stored.google_subject == SUBJECT
