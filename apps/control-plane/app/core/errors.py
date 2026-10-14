"""Domain exceptions. ``main.py`` maps them to ``{"detail": str, "code": str}``."""

from collections.abc import Mapping


class AppError(Exception):
    """Base class for errors that carry an HTTP status and a stable error code."""

    status_code: int = 500
    code: str = "internal_error"
    headers: Mapping[str, str] | None = None

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class AuthenticationError(AppError):
    status_code = 401
    code = "unauthenticated"
    headers = {"WWW-Authenticate": "Bearer"}


class InvalidClientError(AuthenticationError):
    code = "invalid_client"


class InvalidTokenError(AuthenticationError):
    code = "invalid_token"
