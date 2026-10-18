"""Auth primitives: client-secret hashing, password hashing, and signed tokens.

Tokens are HS256 JWTs. The signing key never leaves ``Settings``; callers pass
it in so this module has no configuration dependency of its own.
"""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

ALGORITHM = "HS256"
REQUIRED_CLAIMS = ("sub", "iat", "exp", "jti", "iss", "aud")


class TokenError(Exception):
    """The token is malformed, expired, or was not signed by us."""


@dataclass(frozen=True, slots=True)
class TokenClaims:
    subject: str
    issued_at: datetime
    expires_at: datetime
    token_id: str


def hash_client_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """scrypt hash. The password is not recoverable from the stored value."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_client_secret(secret: str, expected_hash: str) -> bool:
    """Constant-time comparison; safe to call with a dummy hash for unknown clients."""
    return hmac.compare_digest(hash_client_secret(secret), expected_hash.lower())


def issue_access_token(
    *,
    subject: str,
    signing_key: str,
    issuer: str,
    audience: str,
    ttl: timedelta,
    now: datetime | None = None,
) -> tuple[str, TokenClaims]:
    issued_at = (now or datetime.now(UTC)).replace(microsecond=0)
    claims = TokenClaims(
        subject=subject,
        issued_at=issued_at,
        expires_at=issued_at + ttl,
        token_id=secrets.token_urlsafe(16),
    )
    payload = {
        "sub": claims.subject,
        "iat": int(claims.issued_at.timestamp()),
        "exp": int(claims.expires_at.timestamp()),
        "jti": claims.token_id,
        "iss": issuer,
        "aud": audience,
    }
    return jwt.encode(payload, signing_key, algorithm=ALGORITHM), claims


def decode_access_token(token: str, *, signing_key: str, issuer: str, audience: str) -> TokenClaims:
    """Verify signature, issuer, audience and expiry (against the current clock, no leeway)."""
    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[ALGORITHM],
            issuer=issuer,
            audience=audience,
            options={"require": list(REQUIRED_CLAIMS)},
            leeway=0,
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    return TokenClaims(
        subject=str(payload["sub"]),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=UTC),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        token_id=str(payload["jti"]),
    )
