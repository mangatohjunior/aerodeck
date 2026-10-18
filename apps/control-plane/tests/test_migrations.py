"""The committed migration must produce the same schema the models describe."""

import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, create_engine, inspect, text

from app.models import Base

ROOT = Path(__file__).resolve().parents[1]


def _config(url: str) -> Config:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    config.cmd_opts = type("Opts", (), {"x": [f"url={url}"]})()
    return config


def _migrated_columns(url: str) -> dict[str, set[str]]:
    config = _config(url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    sync_url = url.replace("+aiosqlite", "")
    inspector = inspect(create_engine(sync_url))
    return {t: {c["name"] for c in inspector.get_columns(t)} for t in inspector.get_table_names()}


def test_initial_migration_matches_models(tmp_path: Path) -> None:
    url = f"sqlite+aiosqlite:///{(tmp_path / 'migrate.db').as_posix()}"

    migrated = _migrated_columns(url)

    expected = {table.name: {c.name for c in table.columns} for table in Base.metadata.sorted_tables}
    for table, columns in expected.items():
        assert migrated[table] == columns, table
    assert "alembic_version" in migrated


def test_google_downgrade_removes_passwordless_users(tmp_path: Path) -> None:
    url = f"sqlite+aiosqlite:///{(tmp_path / 'migrate.db').as_posix()}"
    config = _config(url)
    command.upgrade(config, "head")

    engine = create_engine(url.replace("+aiosqlite", ""))
    metadata = MetaData()
    metadata.reflect(bind=engine)
    users = metadata.tables["console_users"]
    with engine.begin() as connection:
        connection.execute(
            users.insert(),
            [
                {
                    "id": str(uuid.uuid4()),
                    "email": "ada@example.com",
                    "password_hash": "scrypt$keep",
                    "google_subject": "subject-a",
                },
                {
                    "id": str(uuid.uuid4()),
                    "email": "google@example.com",
                    "password_hash": None,
                    "google_subject": "subject-b",
                },
            ],
        )

    command.downgrade(config, "0010")

    columns = {column["name"]: column for column in inspect(engine).get_columns("console_users")}
    assert "google_subject" not in columns
    assert columns["password_hash"]["nullable"] is False
    with engine.connect() as connection:
        emails = {row[0] for row in connection.execute(text("SELECT email FROM console_users"))}
    assert emails == {"ada@example.com"}
