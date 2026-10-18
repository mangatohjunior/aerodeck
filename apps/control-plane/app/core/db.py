"""Async database access.

``SessionLocal`` is created unbound at import time (no side effects) and bound
to the engine inside ``lifespan``. ``get_session`` is the only session provider;
routes and services receive it through ``SessionDep`` in ``app/api/deps.py``.
"""

from collections.abc import AsyncIterator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.errors import DatabaseUnavailableError

SessionLocal = async_sessionmaker(expire_on_commit=False, autoflush=False)


def create_engine(database_url: str) -> AsyncEngine:
    if database_url.startswith("sqlite"):
        # Test-only. One shared connection so an in-memory database survives
        # across sessions; SQLite is never used outside the test suite.
        engine = create_async_engine(
            database_url,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(engine.sync_engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_async_engine(database_url, pool_pre_ping=True)


def bind_engine(engine: AsyncEngine) -> None:
    SessionLocal.configure(bind=engine)


def unbind_engine() -> None:
    SessionLocal.configure(bind=None)


async def ping(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def get_session() -> AsyncIterator[AsyncSession]:
    if SessionLocal.kw.get("bind") is None:
        raise DatabaseUnavailableError("Database is not configured (AERODECK_DATABASE_URL is unset)")
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
