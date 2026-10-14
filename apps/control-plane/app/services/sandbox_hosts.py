import uuid
from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.sandbox_host import SandboxHost, SandboxHostStatus
from app.repositories.sandbox_hosts import SandboxHostRepository
from app.repositories.sandboxes import SandboxRepository
from app.schemas.sandbox_host import SandboxHostCreate, SandboxHostUpdate

logger = get_logger("services.sandbox_hosts")


class SandboxHostService:
    def __init__(self, hosts: SandboxHostRepository, sandboxes: SandboxRepository) -> None:
        self._hosts = hosts
        self._sandboxes = sandboxes

    async def create(self, data: SandboxHostCreate) -> SandboxHost:
        if await self._hosts.get_by_name(data.name) is not None:
            raise ConflictError(f"Sandbox host {data.name!r} is already enrolled")
        try:
            host = await self._hosts.add(
                SandboxHost(name=data.name, api_url=data.api_url, status=SandboxHostStatus.enrolled)
            )
        except IntegrityError as exc:
            raise ConflictError(f"Sandbox host {data.name!r} is already enrolled") from exc
        logger.info("enrolled sandbox host %s (%s)", host.name, host.id)
        return host

    async def get(self, host_id: uuid.UUID) -> SandboxHost:
        host = await self._hosts.get(host_id)
        if host is None:
            raise NotFoundError(f"Sandbox host {host_id} not found")
        return host

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[SandboxHost], int]:
        return await self._hosts.list(limit=limit, offset=offset)

    async def list_enrolled(self) -> Sequence[SandboxHost]:
        return await self._hosts.list_enrolled()

    async def update(self, host_id: uuid.UUID, data: SandboxHostUpdate) -> SandboxHost:
        host = await self.get(host_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(host, field, value)
        return host

    async def delete(self, host_id: uuid.UUID) -> None:
        host = await self.get(host_id)
        running = await self._sandboxes.count_running_on_host(host.id)
        if running:
            raise ConflictError(f"Sandbox host {host.name!r} still has {running} running sandbox(es)")
        await self._hosts.delete(host)
        logger.info("removed sandbox host %s (%s)", host.name, host.id)

    async def pick_enrolled(self) -> SandboxHost | None:
        hosts = await self._hosts.list_enrolled()
        if not hosts:
            return None
        counts = await self._sandboxes.count_running_by_host()
        return min(hosts, key=lambda host: (counts.get(host.id, 0), host.name))
