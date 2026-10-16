"""Celery worker entrypoint. The API process never imports this module.

Run as its own container from the same image:

    celery -A app.worker worker --queues aerodeck --loglevel INFO

When ``AERODECK_IAC_WORKER=true``, install the tenant Terraform provisioner
(#34). Otherwise jobs stay no-ops.
"""

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.queue import get_celery_app
from app.tasks.environments import use_provisioner

settings = get_settings()
configure_logging(settings.log_level)

if settings.iac_worker:
    from app.services.terraform_provisioner import TerraformProvisioner

    use_provisioner(TerraformProvisioner.from_settings(settings))

# `celery -A app.worker` picks up this attribute.
celery_app = get_celery_app()
