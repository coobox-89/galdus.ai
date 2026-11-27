"""BYOK provider connections per organization."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_provider_connections"
down_revision = "0004_platform_admin"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "provider_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("api_key_encrypted", sa.String(2048), nullable=True),
        sa.Column("api_key_hint", sa.String(16), nullable=True),
        sa.Column("api_base", sa.String(500), nullable=True),
        sa.Column("default_model", sa.String(200), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_provider_connections_organization_id", "provider_connections", ["organization_id"])
    op.execute('ALTER TABLE "provider_connections" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$ DECLARE r text; BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.provider_connections FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade():
    op.drop_index("ix_provider_connections_organization_id", table_name="provider_connections")
    op.drop_table("provider_connections")
