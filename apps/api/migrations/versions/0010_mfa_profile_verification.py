# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""MFA (TOTP + recovery codes), profile photo, email verification and a shared rate-limit table."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_mfa_profile_verification"
down_revision = "0009_session_revocation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_secret", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("mfa_recovery", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("users", sa.Column("mfa_last_step", sa.BigInteger(), nullable=True))
    # Accounts created before verification existed are treated as verified.
    op.execute("update users set email_verified_at = created_at where email_verified_at is null")

    op.create_table(
        "email_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "rate_limit_counters",
        sa.Column("key", sa.String(200), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
    )
    for t in ("email_verifications", "rate_limit_counters"):
        op.execute(f"alter table {t} enable row level security")
        op.execute(f"""do $$ begin
            if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on {t} from anon'; end if;
            if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on {t} from authenticated'; end if;
        end $$""")


def downgrade() -> None:
    op.drop_table("rate_limit_counters")
    op.drop_table("email_verifications")
    for c in ("mfa_last_step", "mfa_recovery", "mfa_enabled", "mfa_secret", "avatar", "email_verified_at"):
        op.drop_column("users", c)
