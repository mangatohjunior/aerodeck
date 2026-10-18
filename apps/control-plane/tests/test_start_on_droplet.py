"""start-on-droplet.sh is sourced by bash; Docker must not --env-file %q values."""

from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "start-on-droplet.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")


def test_writes_bash_quoted_env_and_passes_dash_e_not_env_file() -> None:
    assert "%q" in TEXT
    assert '--env-file "${ENV_FILE}"' not in TEXT
    assert 'DOCKER_ENV_FLAGS+=(-e "${key}")' in TEXT
    assert "AERODECK_ACME_ACCOUNT_KEY" in TEXT
    assert "source" in TEXT
    assert "worker --beat --queues aerodeck" in TEXT
    assert "waiting up to 30s for the API on :8000" in TEXT
    assert "curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:8000/healthz 2>/dev/null" in TEXT
    assert 'CERT_KEY_DIR=/var/lib/aerodeck/certs' in TEXT
    assert '-v "${CERT_KEY_DIR}:${CERT_KEY_DIR}"' in TEXT
