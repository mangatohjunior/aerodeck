import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from starlette.concurrency import run_in_threadpool

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.models.sandbox import Sandbox, SandboxStatus
from app.repositories.sandboxes import SandboxRepository
from app.schemas.sandbox import SandboxCreate
from app.services.hypervisor import Hypervisor
from app.services.projects import ProjectService

logger = get_logger("services.sandboxes")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def is_expired(expires_at: datetime, *, now: datetime) -> bool:
    return _aware(expires_at) <= _aware(now)


class SandboxService:
    def __init__(self, sandboxes: SandboxRepository, projects: ProjectService, hypervisor: Hypervisor) -> None:
        self._sandboxes = sandboxes
        self._projects = projects
        self._hypervisor = hypervisor

    async def create(self, project_id: uuid.UUID, data: SandboxCreate) -> Sandbox:
        await self._projects.get(project_id)
        now = datetime.now(UTC)
        sandbox = await self._sandboxes.add(
            Sandbox(
                project_id=project_id,
                image=data.image,
                vcpu=data.vcpu,
                memory_mib=data.memory_mib,
                ttl_seconds=data.ttl_seconds,
                expires_at=now + timedelta(seconds=data.ttl_seconds),
                status=SandboxStatus.running,
            )
        )
        machine = await run_in_threadpool(
            self._hypervisor.boot, sandbox.id, sandbox.image, sandbox.vcpu, sandbox.memory_mib
        )
        sandbox.hypervisor_vm_id = machine.vm_id
        logger.info(
            "booted sandbox %s image=%s vm=%s ttl=%ds",
            sandbox.id,
            sandbox.image,
            machine.vm_id,
            sandbox.ttl_seconds,
        )
        return sandbox

    async def get(self, project_id: uuid.UUID, sandbox_id: uuid.UUID) -> Sandbox:
        await self._projects.get(project_id)
        sandbox = await self._sandboxes.get(project_id, sandbox_id)
        if sandbox is None:
            raise NotFoundError(f"Sandbox {sandbox_id} not found in project {project_id}")
        return await self._teardown_if_expired(sandbox)

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Sandbox], int]:
        await self._projects.get(project_id)
        return await self._sandboxes.list(project_id, limit=limit, offset=offset)

    async def reap_expired(self, *, now: datetime | None = None) -> Sequence[Sandbox]:
        moment = now or datetime.now(UTC)
        reaped: list[Sandbox] = []
        for sandbox in await self._sandboxes.list_expired(moment):
            reaped.append(await self._teardown(sandbox))
        return reaped

    async def _teardown_if_expired(self, sandbox: Sandbox, *, now: datetime | None = None) -> Sandbox:
        if sandbox.status is SandboxStatus.running and is_expired(sandbox.expires_at, now=now or datetime.now(UTC)):
            return await self._teardown(sandbox)
        return sandbox

    async def _teardown(self, sandbox: Sandbox) -> Sandbox:
        if sandbox.status is SandboxStatus.stopped:
            return sandbox
        await run_in_threadpool(self._hypervisor.stop, sandbox.hypervisor_vm_id or "")
        sandbox.status = SandboxStatus.stopped
        sandbox.hypervisor_vm_id = None
        logger.info("stopped sandbox %s (ttl elapsed)", sandbox.id)
        return sandbox
