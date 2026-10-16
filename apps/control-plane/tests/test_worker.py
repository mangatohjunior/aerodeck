"""Celery configuration and retry behaviour, run eagerly in-process."""

from collections.abc import Iterator

import pytest
from celery import Celery

from app.core.queue import create_celery_app
from app.services.provisioning import (
    JobKind,
    JobOutcome,
    NoopProvisioner,
    PermanentJobError,
    Provisioner,
    TransientJobError,
)
from app.tasks import environments as tasks
from tests.conftest import make_settings


class FlakyProvisioner:
    """Fails `failures` times with a transient error, then succeeds."""

    def __init__(self, failures: int, error: type[Exception] = TransientJobError) -> None:
        self.failures = failures
        self.error = error
        self.calls = 0

    def _attempt(self, kind: JobKind, project_id: str, environment_id: str) -> JobOutcome:
        self.calls += 1
        if self.calls <= self.failures:
            raise self.error(f"attempt {self.calls} failed")
        return JobOutcome(kind, project_id, environment_id, changed=True, detail="done")

    def provision(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
        return self._attempt(JobKind.provision, project_id, environment_id)

    def reconcile(self, *, project_id: str, environment_id: str, **_: str) -> JobOutcome:
        return self._attempt(JobKind.reconcile, project_id, environment_id)


@pytest.fixture
def worker_app() -> Celery:
    settings = make_settings(database_url=None, redis_url="memory://", job_max_retries=3)
    app = create_celery_app(settings)
    app.conf.update(
        result_backend="cache+memory://",
        task_always_eager=True,
        task_eager_propagates=False,
        task_store_eager_result=True,
        result_extended=True,
    )
    for task in app.tasks.values():
        task.store_eager_result = True
    return app


@pytest.fixture
def provisioner() -> Iterator[Provisioner]:
    flaky = FlakyProvisioner(failures=0)
    tasks.use_provisioner(flaky)
    try:
        yield flaky
    finally:
        tasks.use_provisioner(NoopProvisioner())


def test_broker_settings_keep_jobs_safe() -> None:
    app = create_celery_app(make_settings(database_url=None, redis_url="redis://queue:6379/0", job_queue="jobs"))

    assert app.conf.broker_url == "redis://queue:6379/0"
    assert app.conf.result_backend == "redis://queue:6379/0"
    assert app.conf.task_default_queue == "jobs"
    assert app.conf.task_acks_late is True
    assert app.conf.task_reject_on_worker_lost is True
    assert app.conf.worker_prefetch_multiplier == 1
    assert app.conf.accept_content == ["json"]
    for name in tasks.TASK_NAMES:
        assert app.tasks[name].max_retries == 5
        assert app.tasks[name].retry_backoff_max == 600


def test_noop_provisioner_changes_nothing(worker_app: Celery) -> None:
    result = worker_app.tasks[tasks.PROVISION_TASK].apply(kwargs={"project_id": "p", "environment_id": "e"})

    assert result.successful()
    assert result.result["kind"] == "provision"
    assert result.result["changed"] is False
    assert "AERODECK_IAC_WORKER" in result.result["detail"]


def test_transient_failures_retry_until_success(worker_app: Celery, provisioner: FlakyProvisioner) -> None:
    provisioner.failures = 2

    result = worker_app.tasks[tasks.RECONCILE_TASK].apply(kwargs={"project_id": "p", "environment_id": "e"})

    assert result.successful()
    assert provisioner.calls == 3
    assert result.result == {
        "kind": "reconcile",
        "project_id": "p",
        "environment_id": "e",
        "changed": True,
        "detail": "done",
    }


def test_retries_stop_at_the_limit(worker_app: Celery, provisioner: FlakyProvisioner) -> None:
    provisioner.failures = 99

    result = worker_app.tasks[tasks.PROVISION_TASK].apply(kwargs={"project_id": "p", "environment_id": "e"})

    assert result.failed()
    assert isinstance(result.result, TransientJobError)
    assert provisioner.calls == 1 + 3  # first attempt plus job_max_retries


def test_permanent_failures_do_not_retry(worker_app: Celery, provisioner: FlakyProvisioner) -> None:
    provisioner.failures = 99
    provisioner.error = PermanentJobError

    result = worker_app.tasks[tasks.PROVISION_TASK].apply(kwargs={"project_id": "p", "environment_id": "e"})

    assert result.failed()
    assert isinstance(result.result, PermanentJobError)
    assert provisioner.calls == 1
