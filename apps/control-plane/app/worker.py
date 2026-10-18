"""Celery worker entrypoint. The API process never imports this module.

Run as its own container from the same image:

    celery -A app.worker worker --beat --queues aerodeck --loglevel INFO

``--beat`` fires the sandbox reap on ``AERODECK_SANDBOX_REAP_INTERVAL_SECONDS``.
When ``AERODECK_IAC_WORKER=true``, install the tenant Terraform provisioner
(#34). Otherwise jobs stay no-ops.
"""

from celery.signals import worker_process_init

from app.core.config import get_settings
from app.core.db import bind_engine, create_engine
from app.core.logging import configure_logging
from app.core.queue import get_celery_app
from app.tasks.environments import use_provisioner

settings = get_settings()
configure_logging(settings.log_level)

if settings.iac_worker:
    from app.services.terraform_provisioner import TerraformProvisioner

    use_provisioner(TerraformProvisioner.from_settings(settings))


@worker_process_init.connect
def _bind_database(**_: object) -> None:
    url = get_settings().database_url
    if url:
        bind_engine(create_engine(url))


# `celery -A app.worker` picks up this attribute.
celery_app = get_celery_app()
