from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, InvalidCredentialsError
from app.core.logging import get_logger
from app.core.security import dummy_password_hash, hash_password, verify_password
from app.models.console_user import ConsoleUser
from app.repositories.console_users import ConsoleUserRepository
from app.schemas.console_user import ConsoleUserCreate, ConsoleUserGoogleLink

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
        stored = user.password_hash if user is not None and user.password_hash else dummy_password_hash()
        password_matches = verify_password(data.password, stored)
        if user is None or user.password_hash is None or not password_matches:
            raise InvalidCredentialsError("Invalid email or password")
        logger.info("console user signed in %s", user.id)
        return user

    async def link_google(self, data: ConsoleUserGoogleLink) -> ConsoleUser:
        try:
            return await self._link_google(data)
        except IntegrityError:
            return await self._finish_google_race(data)

    async def _link_google(self, data: ConsoleUserGoogleLink) -> ConsoleUser:
        by_subject = await self._users.get_by_subject(data.subject)
        by_email = await self._users.get_by_email(data.email)
        if by_subject is not None and (by_email is None or by_subject.id != by_email.id):
            raise ConflictError("Google account is already linked")
        if by_email is not None:
            if by_email.google_subject and by_email.google_subject != data.subject:
                raise ConflictError("Google account is already linked")
            if by_email.google_subject == data.subject:
                return by_email
            return await self._attach_subject(by_email, data.subject)
        stored = await self._users.add(
            ConsoleUser(email=data.email, password_hash=None, google_subject=data.subject)
        )
        logger.info("registered console user %s", stored.id)
        return stored

    async def _attach_subject(self, user: ConsoleUser, subject: str) -> ConsoleUser:
        user.google_subject = subject
        try:
            stored = await self._users.add(user)
        except IntegrityError as exc:
            raise ConflictError("Google account is already linked") from exc
        logger.info("linked google subject for console user %s", stored.id)
        return stored

    async def _finish_google_race(self, data: ConsoleUserGoogleLink) -> ConsoleUser:
        by_subject = await self._users.get_by_subject(data.subject)
        by_email = await self._users.get_by_email(data.email)
        if by_subject is not None and (by_email is None or by_subject.id != by_email.id):
            raise ConflictError("Google account is already linked")
        if by_email is None:
            raise ConflictError("Google account is already linked")
        if by_email.google_subject == data.subject:
            return by_email
        if by_email.google_subject is None:
            return await self._attach_subject(by_email, data.subject)
        raise ConflictError("Email is already registered")
