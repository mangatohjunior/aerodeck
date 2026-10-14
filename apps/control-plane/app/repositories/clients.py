"""Where enrolled API clients are looked up.

Today clients are enrolled in configuration (``AERODECK_AUTH_CLIENTS``). When
platform state moves to PostgreSQL (#3) a session-backed implementation of
``ClientRepository`` replaces ``SettingsClientRepository`` without touching
the service or router layers.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class EnrolledClient:
    client_id: str
    secret_hash: str


class ClientRepository(Protocol):
    async def get(self, client_id: str) -> EnrolledClient | None: ...


class SettingsClientRepository:
    def __init__(self, clients: Mapping[str, str]) -> None:
        self._clients = {client_id: EnrolledClient(client_id, digest) for client_id, digest in clients.items()}

    async def get(self, client_id: str) -> EnrolledClient | None:
        return self._clients.get(client_id)
