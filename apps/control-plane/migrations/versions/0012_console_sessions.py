"""store a console session hash

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-18 12:20:00 UTC

The raw session token is not stored.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "console_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["console_users.id"],
            name=op.f("fk_console_sessions_user_id_console_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_console_sessions")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_console_sessions_token_hash")),
    )
    op.create_index(op.f("ix_console_sessions_user_id"), "console_sessions", ["user_id"], unique=False)
    op.create_index(op.f("ix_console_sessions_expires_at"), "console_sessions", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_console_sessions_expires_at"), table_name="console_sessions")
    op.drop_index(op.f("ix_console_sessions_user_id"), table_name="console_sessions")
    op.drop_table("console_sessions")
