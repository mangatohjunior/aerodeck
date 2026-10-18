"""Private keys for issued certificates. The database stores metadata only.

Files live under ``AERODECK_CERTIFICATE_KEY_DIR`` (mode ``0700``, each key
``0600``). Traefik still receives the PEM on the snapshot; a database dump
does not.
"""

import os
import uuid
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger("services.certificate_keys")


class FileCertificateKeyStore:
    def __init__(self, directory: str) -> None:
        self._root = Path(directory)

    def put(self, certificate_id: uuid.UUID, private_key_pem: str) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        os.chmod(self._root, 0o700)
        path = self._path(certificate_id)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, private_key_pem.encode())
        finally:
            os.close(fd)
        os.chmod(path, 0o600)
        logger.info("stored certificate key %s", certificate_id)

    def get(self, certificate_id: uuid.UUID) -> str | None:
        path = self._path(certificate_id)
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def delete(self, certificate_id: uuid.UUID) -> None:
        self._path(certificate_id).unlink(missing_ok=True)

    def _path(self, certificate_id: uuid.UUID) -> Path:
        root = self._root.resolve()
        path = (root / f"{certificate_id}.key").resolve()
        if not path.is_relative_to(root):
            raise ValueError(f"certificate key path escaped {root}")
        return path
