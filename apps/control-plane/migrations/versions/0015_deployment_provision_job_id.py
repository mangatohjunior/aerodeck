"""nullable last provision job id on deployments

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-19 14:30:00 UTC

Persist the Celery task id returned when provision is queued with a
``deployment_id`` so console detail can reload structured job status (#139).
Older rows stay null.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("deployments") as batch:
        batch.add_column(sa.Column("provision_job_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("deployments") as batch:
        batch.drop_column("provision_job_id")
