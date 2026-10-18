import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "database_backup.py"
spec = importlib.util.spec_from_file_location("database_backup", SCRIPT)
assert spec is not None and spec.loader is not None
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

KEY = "backups/control-plane/dev/0008/20261018T020000Z.dump"


def test_backup_key_embeds_the_revision() -> None:
    assert backup.backup_key("dev", "0008", "20261018T020000Z") == KEY
    assert backup.revision_in_key(KEY) == "0008"


def test_backup_key_rejects_path_pieces() -> None:
    with pytest.raises(ValueError):
        backup.backup_key("../dev", "0008", "20261018T020000Z")
    with pytest.raises(ValueError):
        backup.backup_key("dev", "0008/evil", "20261018T020000Z")


def test_restore_stops_when_the_revision_does_not_match() -> None:
    with pytest.raises(backup.WrongRevision):
        backup.require_expected_revision(KEY, "0007")


def test_fetch_does_not_download_the_wrong_revision(monkeypatch) -> None:
    def opener(request, timeout=0):
        raise AssertionError("download must not start")

    monkeypatch.setattr(backup, "_credentials", lambda: ("access", "secret-value"))
    with pytest.raises(backup.WrongRevision):
        backup.fetch_dump(KEY, "0007", opener=opener)


def test_backup_script_does_not_print_the_database_url() -> None:
    text = (SCRIPT.parent / "backup-database.sh").read_text(encoding="utf-8")
    assert "database_backup.py" in text
    assert "echo" not in text.split("LIBPQ_URL", 1)[1].split("docker run", 1)[0]
    assert "postgres:16-alpine" in text


def test_put_request_does_not_contain_the_secret() -> None:
    request = backup._request(
        "PUT",
        KEY,
        b"dump-bytes",
        "access-key",
        "super-secret",
    )
    authorization = request.get_header("Authorization")
    assert authorization.startswith("AWS4-HMAC-SHA256 ")
    assert "super-secret" not in authorization
    assert request.full_url == f"https://aerodeck-tfstate.nyc3.digitaloceanspaces.com/{KEY}"
