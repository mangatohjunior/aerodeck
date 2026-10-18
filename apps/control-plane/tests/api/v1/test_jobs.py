import uuid
from collections.abc import AsyncIterator, Callable, Iterator

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_job_dispatcher
from app.core.config import Settings
from app.core.queue import create_celery_app
from app.repositories.jobs import CeleryJobDispatcher
from app.services.provisioning import JobKind, JobOutcome, NoopProvisioner, PermanentJobError
from app.tasks import environments as tasks
from tests.conftest import make_settings, obtain_token

PROJECTS = "/api/v1/projects"


@pytest.fixture
def dispatcher() -> CeleryJobDispatcher:
    # Real dispatcher over an in-process Celery app: jobs run synchronously at publish time.
    worker = create_celery_app(make_settings(database_url=None, redis_url="memory://"))
    worker.conf.update(
        result_backend="cache+memory://",
        task_always_eager=True,
        task_eager_propagates=False,
        task_store_eager_result=True,
        result_extended=True,
    )
    for task in worker.tasks.values():
        task.store_eager_result = True
    return CeleryJobDispatcher(worker)


@pytest.fixture
def queued_app(app: FastAPI, dispatcher: CeleryJobDispatcher) -> FastAPI:
    app.dependency_overrides[get_job_dispatcher] = lambda: dispatcher
    return app


@pytest.fixture
async def client(queued_app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=queued_app), base_url="http://test") as http:
        yield http


@pytest.fixture
async def environment(client: AsyncClient, auth: dict[str, str]) -> dict:
    project = (await client.post(PROJECTS, json={"slug": "payments", "name": "Payments"}, headers=auth)).json()
    response = await client.post(
        f"{PROJECTS}/{project['id']}/environments",
        json={"slug": "prod", "name": "Prod", "kind": "prod"},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()


def job_url(environment: dict, action: str) -> str:
    return f"{PROJECTS}/{environment['project_id']}/environments/{environment['id']}/{action}"


async def test_provision_returns_a_job_at_once(client: AsyncClient, auth: dict[str, str], environment: dict) -> None:
    response = await client.post(job_url(environment, "provision"), headers=auth)

    assert response.status_code == 202
    body = response.json()
    uuid.UUID(body["job_id"])
    assert body["kind"] == "provision"
    assert body["project_id"] == environment["project_id"]
    assert body["environment_id"] == environment["id"]
    assert body["status"] == "queued"


async def test_provision_rejects_unknown_deployment_id(
    client: AsyncClient, auth: dict[str, str], environment: dict
) -> None:
    response = await client.post(
        job_url(environment, "provision"),
        headers=auth,
        json={"deployment_id": str(uuid.uuid4())},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_provision_with_deployment_id_publishes_log_lines(
    client: AsyncClient, auth: dict[str, str], environment: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.deployment_logs import DONE_LINE, clear_memory_log_lines, published_lines
    from app.tasks import environments as env_tasks

    clear_memory_log_lines()
    monkeypatch.setattr(env_tasks, "get_settings", lambda: make_settings(database_url=None, redis_url=None))

    created = await client.post(
        "/api/v1/deployments",
        headers=auth,
        json={"repo_url": "https://github.com/acme/payments"},
    )
    assert created.status_code == 201, created.text
    deployment_id = created.json()["id"]

    accepted = await client.post(
        job_url(environment, "provision"),
        headers=auth,
        json={"deployment_id": deployment_id},
    )
    assert accepted.status_code == 202, accepted.text

    job = await client.get(f"/api/v1/jobs/{accepted.json()['job_id']}", headers=auth)
    assert job.json()["status"] == "succeeded"

    lines = await published_lines(None, uuid.UUID(deployment_id))
    assert lines is not None
    assert lines[0] == "Starting environment provision..."
    assert lines[-1] == DONE_LINE
    clear_memory_log_lines()


async def test_job_outcome_is_readable_afterwards(client: AsyncClient, auth: dict[str, str], environment: dict) -> None:
    accepted = (await client.post(job_url(environment, "reconcile"), headers=auth)).json()

    response = await client.get(f"/api/v1/jobs/{accepted['job_id']}", headers=auth)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["error"] is None
    assert body["result"]["kind"] == "reconcile"
    assert body["result"]["environment_id"] == environment["id"]
    assert body["result"]["changed"] is False


async def test_failed_job_reports_the_error(client: AsyncClient, auth: dict[str, str], environment: dict) -> None:
    class Broken:
        def provision(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
            raise PermanentJobError("region is not enabled for this account")

        def reconcile(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
            raise PermanentJobError("unreachable")

    tasks.use_provisioner(Broken())
    try:
        accepted = (await client.post(job_url(environment, "provision"), headers=auth)).json()
        response = await client.get(f"/api/v1/jobs/{accepted['job_id']}", headers=auth)
    finally:
        tasks.use_provisioner(NoopProvisioner())

    assert response.json()["status"] == "failed"
    assert response.json()["error"] == "PermanentJobError: region is not enabled for this account"
    assert response.json()["result"] is None


async def test_unknown_job_looks_queued(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.get(f"/api/v1/jobs/{uuid.uuid4()}", headers=auth)

    assert response.status_code == 200
    assert response.json()["status"] == "queued"


async def test_job_id_must_be_a_uuid(client: AsyncClient, auth: dict[str, str]) -> None:
    assert (await client.get("/api/v1/jobs/not-a-job", headers=auth)).status_code == 422


async def test_jobs_need_an_existing_environment(client: AsyncClient, auth: dict[str, str], environment: dict) -> None:
    missing = f"{PROJECTS}/{environment['project_id']}/environments/{uuid.uuid4()}/provision"

    response = await client.post(missing, headers=auth)

    assert response.status_code == 404


async def test_jobs_require_a_token(client: AsyncClient, environment: dict) -> None:
    enqueue = await client.post(job_url(environment, "provision"))
    status = await client.get(f"/api/v1/jobs/{uuid.uuid4()}")

    assert enqueue.status_code == 401
    assert status.status_code == 401


async def test_without_a_queue_jobs_are_unavailable(
    app_factory: Callable[[Settings], FastAPI], database_url: str
) -> None:
    detached = app_factory(make_settings(database_url=database_url, redis_url=None))
    async with LifespanManager(detached):
        async with AsyncClient(transport=ASGITransport(app=detached), base_url="http://test") as http:
            token = await obtain_token(http)
            response = await http.get(f"/api/v1/jobs/{uuid.uuid4()}", headers={"Authorization": f"Bearer {token}"})
            readiness = await http.get("/readyz")

    assert response.status_code == 503
    assert response.json()["code"] == "queue_unavailable"
    assert readiness.json()["checks"]["queue"] == "skipped"


async def test_readiness_reports_an_unreachable_broker(
    app_factory: Callable[[Settings], FastAPI], database_url: str
) -> None:
    unreachable = app_factory(make_settings(database_url=database_url, redis_url="redis://127.0.0.1:1/0"))
    async with LifespanManager(unreachable):
        async with AsyncClient(transport=ASGITransport(app=unreachable), base_url="http://test") as http:
            readiness = await http.get("/readyz")

    assert readiness.status_code == 503
    assert readiness.json()["status"] == "degraded"
    assert readiness.json()["checks"]["queue"] == "failed"


@pytest.fixture(autouse=True)
def _restore_provisioner() -> Iterator[None]:
    yield
    tasks.use_provisioner(NoopProvisioner())


def test_job_kinds_match_the_routes() -> None:
    assert {k.value for k in JobKind} == {"provision", "reconcile"}
