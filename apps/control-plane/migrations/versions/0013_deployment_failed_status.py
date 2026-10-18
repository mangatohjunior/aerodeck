"""allow deployments.status = failed

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-18 20:10:00 UTC

``deployment_status`` is VARCHAR(16) (native_enum=False). No DDL is required;
the model enum now includes ``failed``. This revision keeps Alembic heads
aligned with the app.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # native_enum=False → VARCHAR(16); ``failed`` fits without ALTER.
    return


def downgrade() -> None:
    # Rewrite failed rows so the app enum can drop the value; no ALTER on SQLite.
    op.execute("UPDATE deployments SET status = 'running' WHERE status = 'failed'")
