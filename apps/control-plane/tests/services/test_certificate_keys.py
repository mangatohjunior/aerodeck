import os
import uuid
from pathlib import Path

from app.services.certificate_keys import FileCertificateKeyStore


def test_put_get_and_delete_round_trip(tmp_path: Path) -> None:
    store = FileCertificateKeyStore(str(tmp_path))
    certificate_id = uuid.uuid4()
    pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"

    store.put(certificate_id, pem)

    path = tmp_path / f"{certificate_id}.key"
    assert path.read_text(encoding="utf-8") == pem
    assert store.get(certificate_id) == pem
    if os.name == "posix":
        assert path.stat().st_mode & 0o777 == 0o600
        assert tmp_path.stat().st_mode & 0o777 == 0o700

    store.delete(certificate_id)
    assert store.get(certificate_id) is None
    store.delete(certificate_id)
