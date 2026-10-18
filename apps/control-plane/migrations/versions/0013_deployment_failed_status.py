"""allow deployments.status = failed

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-18 20:10:00 UTC

``deployment_status`` is VARCHAR(16) (native_enum=False). Document ``failed``
as an allowed value for Alembic/model parity; existing rows are unchanged.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "deployments",
        "status",
        existing_type=sa.Enum(
            "queued",
            "running",
            "succeeded",
            name="deployment_status",
            native_enum=False,
            length=16,
        ),
        type_=sa.Enum(
            "queued",
            "running",
            "succeeded",
            "failed",
            name="deployment_status",
            native_enum=False,
            length=16,
        ),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "deployments",
        "status",
        existing_type=sa.Enum(
            "queued",
            "running",
            "succeeded",
            "failed",
            name="deployment_status",
            native_enum=False,
            length=16,
        ),
        type_=sa.Enum(
            "queued",
            "running",
            "succeeded",
            name="deployment_status",
            native_enum=False,
            length=16,
        ),
        existing_nullable=False,
    )
