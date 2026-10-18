import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.console_user import ConsoleUser


class ConsoleUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, user: ConsoleUser) -> ConsoleUser:
        self._session.add(user)
        try:
            async with self._session.begin_nested():
                await self._session.flush()
        except IntegrityError:
            self._session.expunge(user)
            raise
        await self._session.refresh(user)
        return user

    async def get(self, user_id: uuid.UUID) -> ConsoleUser | None:
        return await self._session.get(ConsoleUser, user_id)

    async def get_by_email(self, email: str) -> ConsoleUser | None:
        result = await self._session.execute(select(ConsoleUser).where(ConsoleUser.email == email))
        return result.scalar_one_or_none()

    async def get_by_subject(self, subject: str) -> ConsoleUser | None:
        result = await self._session.execute(select(ConsoleUser).where(ConsoleUser.google_subject == subject))
        return result.scalar_one_or_none()
