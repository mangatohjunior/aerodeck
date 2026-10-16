"""DigitalOcean private URIs must become asyncpg URLs with ssl=require."""

from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rewrite_do_postgres_url.py"


def _load():
    spec = importlib.util.spec_from_file_location("rewrite_do_postgres_url", SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit("could not load rewrite_do_postgres_url.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_rewrites_sslmode_and_scheme() -> None:
    mod = _load()
    out = mod.rewrite_do_postgres_url(
        "postgresql://doadmin:secret@private-aerodeck-dev-pg.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
    )
    assert out.startswith("postgresql+asyncpg://doadmin:secret@")
    assert ":25060/defaultdb?" in out
    assert "ssl=require" in out
    assert "sslmode" not in out


def test_encodes_special_password() -> None:
    mod = _load()
    out = mod.rewrite_do_postgres_url(
        "postgresql://doadmin:p%40ss%2Fword@private-host.example:25060/defaultdb?sslmode=require"
    )
    assert "p%40ss%2Fword" in out


def test_rejects_hostname_only() -> None:
    mod = _load()
    try:
        mod.rewrite_do_postgres_url(
            'postgresql+asyncpg://"private-aerodeck-dev-pg-do-user-0.g.db.ondigitalocean.com'
        )
    except SystemExit:
        return
    raise SystemExit("hostname-only URI must be rejected")
