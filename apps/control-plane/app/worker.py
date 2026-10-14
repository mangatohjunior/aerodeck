"""Celery worker entrypoint. The API process never imports this module.

Run as its own container from the same image:

    celery -A app.worker worker --queues aerodeck --loglevel INFO

When the IaC engine lands (#5), install it here with
``app.tasks.environments.use_provisioner(...)`` before the worker starts.
"""

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.queue import get_celery_app

configure_logging(get_settings().log_level)

# `celery -A app.worker` picks up this attribute.
celery_app = get_celery_app()
