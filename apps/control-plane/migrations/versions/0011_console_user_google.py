"""link a Google subject to a console user

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-18 11:50:00 UTC

password_hash stays null for a Google-only account.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("console_users") as batch:
        batch.add_column(sa.Column("google_subject", sa.String(length=255), nullable=True))
        batch.alter_column("password_hash", existing_type=sa.String(length=200), nullable=True)
        batch.create_unique_constraint(op.f("uq_console_users_google_subject"), ["google_subject"])


def downgrade() -> None:
    # A Google-only account has no password. Remove it before the column is required again.
    op.execute(sa.text("DELETE FROM console_users WHERE password_hash IS NULL"))
    with op.batch_alter_table("console_users") as batch:
        batch.drop_constraint(op.f("uq_console_users_google_subject"), type_="unique")
        batch.drop_column("google_subject")
        batch.alter_column("password_hash", existing_type=sa.String(length=200), nullable=False)
