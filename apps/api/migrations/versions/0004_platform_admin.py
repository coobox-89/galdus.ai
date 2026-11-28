# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Add platform administrator flag to users."""
from alembic import op
import sqlalchemy as sa

revision = "0004_platform_admin"
down_revision = "0003_supabase_lockdown"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("users", "is_platform_admin")
