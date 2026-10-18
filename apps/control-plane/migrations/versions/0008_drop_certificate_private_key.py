"""drop certificate private keys from the API database

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-18 01:50:00 UTC

Keys live under AERODECK_CERTIFICATE_KEY_DIR. Downgrade adds an empty column;
it does not restore PEM.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("certificates", "private_key_pem")


def downgrade() -> None:
    op.add_column("certificates", sa.Column("private_key_pem", sa.Text(), nullable=True))
