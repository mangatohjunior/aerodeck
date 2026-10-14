"""TLS certificates issued via DNS-01

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-14 20:20:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "certificates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("route_id", sa.Uuid(), nullable=False),
        sa.Column("hostname", sa.String(length=253), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "issued", "failed", name="certificate_status", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("not_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fingerprint_sha256", sa.String(length=64), nullable=True),
        sa.Column("certificate_pem", sa.Text(), nullable=True),
        sa.Column("private_key_pem", sa.Text(), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["route_id"], ["routes.id"], name=op.f("fk_certificates_route_id_routes"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_certificates")),
        sa.UniqueConstraint("route_id", name="uq_certificates_route_id"),
    )
    op.create_index(op.f("ix_certificates_route_id"), "certificates", ["route_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_certificates_route_id"), table_name="certificates")
    op.drop_table("certificates")
