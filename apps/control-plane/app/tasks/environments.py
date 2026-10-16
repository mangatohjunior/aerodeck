"""Provisioning and reconciliation jobs for environments.

Tasks are thin: resolve the provisioner, run one operation, return a JSON-safe
outcome. ``TransientJobError`` (and plain connection trouble) is retried with
exponential backoff; anything else fails the job immediately.
"""

from celery import Task, shared_task

from app.core.logging import get_logger
from app.services.provisioning import JobKind, NoopProvisioner, Provisioner, TransientJobError

logger = get_logger("tasks.environments")

PROVISION_TASK = "aerodeck.environments.provision"
RECONCILE_TASK = "aerodeck.environments.reconcile"
TASK_NAMES = (PROVISION_TASK, RECONCILE_TASK)

_RETRY_ON = (TransientJobError, ConnectionError, TimeoutError)

_provisioner: Provisioner = NoopProvisioner()


def use_provisioner(provisioner: Provisioner) -> None:
    """Worker bootstrap hook. ``worker.py`` installs ``TerraformProvisioner`` when enabled."""
    global _provisioner
    _provisioner = provisioner


def _run(
    task: Task,
    kind: JobKind,
    project_id: str,
    environment_id: str,
    **meta: str,
) -> dict[str, str | bool]:
    attempt = task.request.retries + 1
    logger.info("%s environment=%s project=%s attempt=%d", kind.value, environment_id, project_id, attempt)
    operation = _provisioner.provision if kind is JobKind.provision else _provisioner.reconcile
    outcome = operation(project_id=project_id, environment_id=environment_id, **meta)
    logger.info("%s environment=%s changed=%s", kind.value, environment_id, outcome.changed)
    return outcome.as_dict()


@shared_task(
    name=PROVISION_TASK,
    bind=True,
    autoretry_for=_RETRY_ON,
    retry_backoff=True,
    retry_jitter=True,
    acks_late=True,
)
def provision_environment(self: Task, *, project_id: str, environment_id: str, **meta: str) -> dict[str, str | bool]:
    return _run(self, JobKind.provision, project_id, environment_id, **meta)


@shared_task(
    name=RECONCILE_TASK,
    bind=True,
    autoretry_for=_RETRY_ON,
    retry_backoff=True,
    retry_jitter=True,
    acks_late=True,
)
def reconcile_environment(self: Task, *, project_id: str, environment_id: str, **meta: str) -> dict[str, str | bool]:
    return _run(self, JobKind.reconcile, project_id, environment_id, **meta)
