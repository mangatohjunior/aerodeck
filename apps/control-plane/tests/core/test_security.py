from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.core import security
from app.core.config import Settings

KEY = "0123456789abcdef0123456789abcdef-signing"


def test_secret_hash_round_trips() -> None:
    digest = security.hash_client_secret("s3cret")

    assert len(digest) == 64
    assert security.verify_client_secret("s3cret", digest)
    assert security.verify_client_secret("s3cret", digest.upper())
    assert not security.verify_client_secret("S3CRET", digest)


def test_token_round_trips_claims() -> None:
    token, issued = security.issue_access_token(
        subject="svc", signing_key=KEY, issuer="iss", audience="aud", ttl=timedelta(minutes=15)
    )

    decoded = security.decode_access_token(token, signing_key=KEY, issuer="iss", audience="aud")

    assert decoded == issued
    assert decoded.expires_at - decoded.issued_at == timedelta(minutes=15)
    assert decoded.issued_at.tzinfo is UTC


def test_expired_token_is_rejected() -> None:
    token, _ = security.issue_access_token(
        subject="svc",
        signing_key=KEY,
        issuer="iss",
        audience="aud",
        ttl=timedelta(minutes=1),
        now=datetime.now(UTC) - timedelta(minutes=2),
    )

    with pytest.raises(security.TokenError, match="expired"):
        security.decode_access_token(token, signing_key=KEY, issuer="iss", audience="aud")


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"signing_key": "another-key-another-key-another-key"}, "wrong key"),
        ({"issuer": "someone-else"}, "wrong issuer"),
        ({"audience": "someone-else"}, "wrong audience"),
    ],
)
def test_token_fails_closed(kwargs: dict[str, str], reason: str) -> None:
    token, _ = security.issue_access_token(
        subject="svc", signing_key=KEY, issuer="iss", audience="aud", ttl=timedelta(minutes=1)
    )
    verify = {"signing_key": KEY, "issuer": "iss", "audience": "aud"} | kwargs

    with pytest.raises(security.TokenError):
        security.decode_access_token(token, **verify)


def test_unsigned_token_is_rejected() -> None:
    import jwt

    unsigned = jwt.encode({"sub": "svc", "iss": "iss", "aud": "aud"}, key="", algorithm="none")

    with pytest.raises(security.TokenError):
        security.decode_access_token(unsigned, signing_key=KEY, issuer="iss", audience="aud")


def test_settings_require_sha256_digests() -> None:
    with pytest.raises(ValidationError, match="SHA-256"):
        Settings(_env_file=None, auth_signing_key=KEY, auth_clients={"x": "plaintext-secret"})


def test_settings_require_a_long_signing_key() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, auth_signing_key="short")
