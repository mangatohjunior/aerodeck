"""The committed migration must produce the same schema the models describe."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.models import Base

ROOT = Path(__file__).resolve().parents[1]


def _migrated_columns(url: str) -> dict[str, set[str]]:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    config.cmd_opts = type("Opts", (), {"x": [f"url={url}"]})()
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
