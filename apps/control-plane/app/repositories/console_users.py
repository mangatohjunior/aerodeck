from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.console_user import ConsoleUser


class ConsoleUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, user: ConsoleUser) -> ConsoleUser:
        self._session.add(user)
        await self._session.flush()
        return user

    async def get_by_email(self, email: str) -> ConsoleUser | None:
        result = await self._session.execute(select(ConsoleUser).where(ConsoleUser.email == email))
        return result.scalar_one_or_none()

    async def get_by_subject(self, subject: str) -> ConsoleUser | None:
        result = await self._session.execute(select(ConsoleUser).where(ConsoleUser.google_subject == subject))
        return result.scalar_one_or_none()

    async def save(self, user: ConsoleUser) -> ConsoleUser:
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user
