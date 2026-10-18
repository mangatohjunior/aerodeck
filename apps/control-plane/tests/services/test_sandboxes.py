import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.core.db import SessionLocal
from app.models.sandbox import Sandbox, SandboxStatus
from app.repositories.projects import ProjectRepository
from app.repositories.sandbox_hosts import SandboxHostRepository
from app.repositories.sandboxes import SandboxRepository
from app.services.hypervisor import MemoryHypervisor, SandboxError
from app.services.projects import ProjectService
from app.services.sandbox_hosts import SandboxHostService
from app.services.sandboxes import SandboxService, is_expired
from tests.api.v1.test_projects import create_project
from tests.api.v1.test_sandboxes import sandbox_body, sandboxes_url


def test_is_expired_compares_aware_and_naive_datetimes() -> None:
    now = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
    assert is_expired(datetime(2026, 10, 14, 11, 59, tzinfo=UTC), now=now)
    assert is_expired(datetime(2026, 10, 14, 12, 0), now=now)
    assert not is_expired(now + timedelta(seconds=1), now=now)


class _FailOneHypervisor(MemoryHypervisor):
    def __init__(self, fail_vm: str) -> None:
        super().__init__()
        self.fail_vm = fail_vm

    def stop(self, vm_id: str) -> None:
        if vm_id == self.fail_vm:
            raise SandboxError(f"Firecracker refused to stop {vm_id}: HTTP 502")
        super().stop(vm_id)


async def test_reap_continues_after_one_hypervisor_failure(client: AsyncClient, auth: dict[str, str]) -> None:
    project = await create_project(client, auth)
    first = await client.post(sandboxes_url(project), json=sandbox_body("alpine-3.20"), headers=auth)
    second = await client.post(sandboxes_url(project), json=sandbox_body("debian-12"), headers=auth)
    assert first.status_code == 201 and second.status_code == 201
    fail_id = uuid.UUID(first.json()["id"])
    ok_id = uuid.UUID(second.json()["id"])

    async with SessionLocal() as session:
        for sandbox_id in (fail_id, ok_id):
            row = await session.get(Sandbox, sandbox_id)
            assert row is not None
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()

        service = SandboxService(
            SandboxRepository(session),
            ProjectService(ProjectRepository(session)),
            _FailOneHypervisor(fail_id.hex),
            SandboxHostService(SandboxHostRepository(session), SandboxRepository(session)),
            require_host=False,
        )
        reaped = await service.reap_expired()
        await session.commit()

    assert [item.id for item in reaped] == [ok_id]
    async with SessionLocal() as session:
        assert (await session.get(Sandbox, fail_id)).status is SandboxStatus.running
        assert (await session.get(Sandbox, ok_id)).status is SandboxStatus.stopped
