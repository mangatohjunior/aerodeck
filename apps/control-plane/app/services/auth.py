"""Client authentication: exchange enrolled credentials for a short-lived token, and verify tokens."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core import security
from app.core.config import Settings
from app.core.errors import InvalidClientError, InvalidTokenError
from app.core.logging import get_logger
from app.repositories.clients import ClientRepository

logger = get_logger("services.auth")

# Compared against when the client_id is unknown, so unknown and wrong-secret
# requests take the same time.
_DUMMY_SECRET_HASH = security.hash_client_secret("aerodeck-no-such-client")


@dataclass(frozen=True, slots=True)
class IssuedToken:
    access_token: str
    expires_in: int
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class AuthenticatedClient:
    client_id: str
    token_id: str
    expires_at: datetime


class AuthService:
    def __init__(self, clients: ClientRepository, settings: Settings) -> None:
        self._clients = clients
        self._signing_key = settings.auth_signing_key.get_secret_value()
        self._issuer = settings.auth_issuer
        self._audience = settings.auth_audience
        self._ttl = timedelta(seconds=settings.auth_token_ttl_seconds)

    async def issue_token(self, client_id: str, client_secret: str) -> IssuedToken:
        client = await self._clients.get(client_id)
        expected_hash = client.secret_hash if client else _DUMMY_SECRET_HASH
        secret_ok = security.verify_client_secret(client_secret, expected_hash)

        if client is None or not secret_ok:
            logger.info("rejected token request for client_id=%s", client_id)
            raise InvalidClientError("Unknown client or wrong client secret")

        token, claims = security.issue_access_token(
            subject=client.client_id,
            signing_key=self._signing_key,
            issuer=self._issuer,
            audience=self._audience,
            ttl=self._ttl,
        )
        logger.info("issued token jti=%s for client_id=%s", claims.token_id, client.client_id)
        return IssuedToken(
            access_token=token,
            expires_in=int(self._ttl.total_seconds()),
            expires_at=claims.expires_at,
        )

    async def authenticate(self, token: str) -> AuthenticatedClient:
        try:
            claims = security.decode_access_token(
                token,
                signing_key=self._signing_key,
                issuer=self._issuer,
                audience=self._audience,
            )
        except security.TokenError as exc:
            raise InvalidTokenError("Access token is invalid or has expired") from exc

        # A client removed from the enrolment list loses access before its token expires.
        if await self._clients.get(claims.subject) is None:
            raise InvalidTokenError("Client is no longer enrolled")

        return AuthenticatedClient(
            client_id=claims.subject,
            token_id=claims.token_id,
            expires_at=claims.expires_at,
        )
