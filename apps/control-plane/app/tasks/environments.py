"""Provisioning and reconciliation jobs for environments.

Tasks are thin: resolve the provisioner, run one operation, return a JSON-safe
outcome. ``TransientJobError`` (and plain connection trouble) is retried with
exponential backoff; anything else fails the job immediately.

When ``deployment_id`` is present in task meta (provision only), progress lines
are published for the deployment log SSE route (#121). ``Done`` is published only
on success so the console does not mark a failed deployment as succeeded.
"""

import uuid

from celery import Task, shared_task

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.metrics import record_iac_apply_failure
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


def _deployment_id_from_meta(
    meta: dict[str, str],
    *,
    project_id: str,
    environment_id: str,
) -> uuid.UUID | None:
    raw = meta.pop("deployment_id", None)
    if raw is None:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        logger.warning(
            "event=deployment_id_invalid error_type=ValueError project=%s environment=%s",
            project_id,
            environment_id,
        )
        return None


def _will_retry(task: Task, exc: BaseException) -> bool:
    if not isinstance(exc, _RETRY_ON):
        return False
    return task.request.retries < task.max_retries


def _run(
    task: Task,
    kind: JobKind,
    project_id: str,
    environment_id: str,
    **meta: str,
) -> dict[str, str | bool]:
    # Lazy import: deployment_logs → queue → this module.
    from app.services.deployment_logs import (
        DONE_LINE,
        PROVISION_START_LINE,
        PROVISION_SUCCESS_LINE,
        publish_provision_lines_sync,
        provision_failure_line,
    )

    attempt = task.request.retries + 1
    # Always strip deployment_id so TerraformProvisioner never sees an unexpected kwarg.
    linked = _deployment_id_from_meta(meta, project_id=project_id, environment_id=environment_id)
    deployment_id = linked if kind is JobKind.provision else None
    redis_url = get_settings().redis_url if deployment_id is not None else None
    logger.info("%s environment=%s project=%s attempt=%d", kind.value, environment_id, project_id, attempt)
    if deployment_id is not None and attempt == 1:
        publish_provision_lines_sync(redis_url, deployment_id, PROVISION_START_LINE)
    operation = _provisioner.provision if kind is JobKind.provision else _provisioner.reconcile
    try:
        outcome = operation(project_id=project_id, environment_id=environment_id, **meta)
    except Exception as exc:
        if kind is JobKind.provision:
            logger.error("event=iac_apply_failed environment=%s project=%s", environment_id, project_id)
            record_iac_apply_failure()
        if deployment_id is not None and not _will_retry(task, exc):
            # No Done: Terminal treats Done as success. Stream ends on follow-idle.
            publish_provision_lines_sync(redis_url, deployment_id, provision_failure_line(exc))
            from app.tasks.deployment_status import mark_deployment_failed_sync

            try:
                mark_deployment_failed_sync(deployment_id)
            except Exception as status_exc:
                logger.warning(
                    "event=deployment_failed_status_skipped deployment=%s error_type=%s",
                    deployment_id,
                    type(status_exc).__name__,
                )
        raise
    if deployment_id is not None:
        # Fixed success line only — never publish outcome.detail (may grow unsafe).
        publish_provision_lines_sync(redis_url, deployment_id, PROVISION_SUCCESS_LINE, DONE_LINE)
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
