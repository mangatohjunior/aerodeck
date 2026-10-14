"""sandbox TTL and stopped status

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-14 23:10:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sandboxes",
        sa.Column("ttl_seconds", sa.Integer(), nullable=False, server_default="3600"),
    )
    op.add_column(
        "sandboxes",
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(op.f("ix_sandboxes_expires_at"), "sandboxes", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sandboxes_expires_at"), table_name="sandboxes")
    op.drop_column("sandboxes", "expires_at")
    op.drop_column("sandboxes", "ttl_seconds")
