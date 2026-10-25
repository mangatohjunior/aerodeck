"""Tests for configure-iac-worker.sh script."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "scripts"
SCRIPT = ROOT / "configure-iac-worker.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")


def test_script_exists_and_uses_strict_mode() -> None:
    assert SCRIPT.is_file()
    assert "#!/usr/bin/env bash" in TEXT
    assert "set -euo pipefail" in TEXT
    assert 'if [[ "${EUID}" -ne 0 ]]; then' in TEXT


def test_env_file_security_permissions() -> None:
    assert "umask 077" in TEXT
    assert 'chmod 600 "${ENV_FILE}"' in TEXT
    assert 'ENV_FILE="/etc/aerodeck/control-plane.env"' in TEXT


def test_handles_iac_keys() -> None:
    assert "AERODECK_IAC_WORKER" in TEXT
    assert "AERODECK_IAC_APPLY" in TEXT
    assert "AERODECK_SPACES_ACCESS_ID" in TEXT
    assert "AERODECK_SPACES_SECRET_KEY" in TEXT
    assert "AERODECK_DIGITALOCEAN_TOKEN" in TEXT


def test_restarts_worker_container() -> None:
    assert "docker rm -f aerodeck-worker" in TEXT
    assert "docker run -d --name aerodeck-worker" in TEXT
    assert "celery -A app.worker worker --beat --queues aerodeck" in TEXT
    assert 'DOCKER_ENV_FLAGS+=(-e "${key}")' in TEXT


def test_secrets_are_not_echoed_and_are_cleared() -> None:
    assert "unset SPACES_SECRET_KEY DO_TOKEN" in TEXT
    # Verify echo statements do not print the secret values
    for line in TEXT.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("echo ") and not trimmed.startswith("echo \"usage:"):
            assert "${SPACES_SECRET_KEY" not in trimmed
            assert "${DO_TOKEN" not in trimmed

