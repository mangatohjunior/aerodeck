"""public DNS address records for routes

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-14 22:40:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dns_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("route_id", sa.Uuid(), nullable=False),
        sa.Column("hostname", sa.String(length=253), nullable=False),
        sa.Column(
            "record_type",
            sa.Enum("A", "AAAA", "CNAME", name="dns_record_type", native_enum=False, length=8),
            nullable=False,
        ),
        sa.Column("data", sa.String(length=253), nullable=False),
        sa.Column("ttl", sa.Integer(), nullable=False),
        sa.Column("provider_record_id", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum("published", "unpublished", name="dns_record_status", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["route_id"], ["routes.id"], name=op.f("fk_dns_records_route_id_routes"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dns_records")),
        sa.UniqueConstraint("route_id", name="uq_dns_records_route_id"),
    )
    op.create_index(op.f("ix_dns_records_route_id"), "dns_records", ["route_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_dns_records_route_id"), table_name="dns_records")
    op.drop_table("dns_records")
