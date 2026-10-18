from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.console_session import ConsoleSession


class ConsoleSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, stored: ConsoleSession) -> ConsoleSession:
        self._session.add(stored)
        try:
            async with self._session.begin_nested():
                await self._session.flush()
        except IntegrityError:
            self._session.expunge(stored)
            raise
        await self._session.refresh(stored)
        return stored

    async def get_by_token_hash(self, token_hash: str) -> ConsoleSession | None:
        result = await self._session.execute(
            select(ConsoleSession)
            .where(ConsoleSession.token_hash == token_hash)
            .options(selectinload(ConsoleSession.user))
        )
        return result.scalar_one_or_none()

    async def delete(self, stored: ConsoleSession) -> None:
        await self._session.delete(stored)
        await self._session.flush()
