import uuid
from collections.abc import Sequence

from starlette.concurrency import run_in_threadpool

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.models.sandbox import Sandbox, SandboxStatus
from app.repositories.sandboxes import SandboxRepository
from app.schemas.sandbox import SandboxCreate
from app.services.hypervisor import Hypervisor
from app.services.projects import ProjectService

logger = get_logger("services.sandboxes")


class SandboxService:
    def __init__(self, sandboxes: SandboxRepository, projects: ProjectService, hypervisor: Hypervisor) -> None:
        self._sandboxes = sandboxes
        self._projects = projects
        self._hypervisor = hypervisor

    async def create(self, project_id: uuid.UUID, data: SandboxCreate) -> Sandbox:
        await self._projects.get(project_id)
        sandbox = await self._sandboxes.add(
            Sandbox(
                project_id=project_id,
                image=data.image,
                vcpu=data.vcpu,
                memory_mib=data.memory_mib,
                status=SandboxStatus.running,
            )
        )
        machine = await run_in_threadpool(
            self._hypervisor.boot, sandbox.id, sandbox.image, sandbox.vcpu, sandbox.memory_mib
        )
        sandbox.hypervisor_vm_id = machine.vm_id
        logger.info("booted sandbox %s image=%s vm=%s", sandbox.id, sandbox.image, machine.vm_id)
        return sandbox

    async def get(self, project_id: uuid.UUID, sandbox_id: uuid.UUID) -> Sandbox:
        await self._projects.get(project_id)
        sandbox = await self._sandboxes.get(project_id, sandbox_id)
        if sandbox is None:
            raise NotFoundError(f"Sandbox {sandbox_id} not found in project {project_id}")
        return sandbox

    async def list(self, project_id: uuid.UUID, *, limit: int, offset: int) -> tuple[Sequence[Sandbox], int]:
        await self._projects.get(project_id)
        return await self._sandboxes.list(project_id, limit=limit, offset=offset)
