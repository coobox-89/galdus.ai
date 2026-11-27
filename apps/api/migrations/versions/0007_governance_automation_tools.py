"""Governance (invitations, audit, org limits), automations, MCP servers, agent tools."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_governance_automation"
down_revision = "0006_knowledge_agents"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
NEW = ("invitations", "audit_events", "mcp_servers", "automations")


def org():
    return sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


def user_fk(name):
    return sa.Column(name, UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def ts(name, nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade():
    op.add_column("organizations", sa.Column("monthly_token_limit", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("organizations", sa.Column("guardrails_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("agents", sa.Column("tools", JSONB, nullable=False, server_default="[]"))
    op.add_column("agents", sa.Column("mcp_server_ids", JSONB, nullable=False, server_default="[]"))
    op.add_column("runs", sa.Column("steps", JSONB, nullable=False, server_default="[]"))
    op.add_column("runs", sa.Column("automation_id", UUID, nullable=True))
    op.create_index("ix_runs_automation_id", "runs", ["automation_id"])

    op.create_table("invitations", sa.Column("id", UUID, primary_key=True), org(),
                    sa.Column("email", sa.String(320), nullable=False), sa.Column("role", sa.String(32), nullable=False),
                    sa.Column("token_hash", sa.String(64), nullable=False, unique=True), user_fk("invited_by"),
                    ts("expires_at"), ts("accepted_at", True), ts("created_at"))
    op.create_table("audit_events", sa.Column("id", UUID, primary_key=True), org(), user_fk("actor_id"),
                    sa.Column("action", sa.String(60), nullable=False), sa.Column("target_type", sa.String(40), nullable=False),
                    sa.Column("target_id", sa.String(64), nullable=False), sa.Column("details", JSONB, nullable=False), ts("created_at"))
    op.create_table("mcp_servers", sa.Column("id", UUID, primary_key=True), org(),
                    sa.Column("name", sa.String(80), nullable=False), sa.Column("url", sa.String(500), nullable=False),
                    sa.Column("auth_header_encrypted", sa.String(4096), nullable=True), sa.Column("allowed_tools", JSONB, nullable=False),
                    user_fk("created_by"), ts("created_at"))
    op.create_table("automations", sa.Column("id", UUID, primary_key=True), org(),
                    sa.Column("name", sa.String(120), nullable=False),
                    sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("input", sa.Text(), nullable=False), sa.Column("cron", sa.String(100), nullable=True),
                    sa.Column("webhook_token_hash", sa.String(64), nullable=True, unique=True),
                    sa.Column("deliver_url_encrypted", sa.String(4096), nullable=True),
                    sa.Column("enabled", sa.Boolean(), nullable=False), ts("next_run_at", True), ts("last_run_at", True),
                    sa.Column("last_status", sa.String(20), nullable=True), sa.Column("consecutive_failures", sa.Integer(), nullable=False),
                    user_fk("created_by"), ts("created_at"))
    for t, cols in {"invitations": ["organization_id"], "audit_events": ["organization_id", "created_at"],
                    "mcp_servers": ["organization_id"], "automations": ["organization_id", "agent_id", "next_run_at"]}.items():
        for c in cols:
            op.create_index(f"ix_{t}_{c}", t, [c])
    for t in NEW:
        op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$ DECLARE r text; BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.invitations, public.audit_events, public.mcp_servers, public.automations FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade():
    for t in reversed(NEW):
        op.drop_table(t)
    op.drop_index("ix_runs_automation_id", table_name="runs")
    op.drop_column("runs", "automation_id")
    op.drop_column("runs", "steps")
    op.drop_column("agents", "mcp_server_ids")
    op.drop_column("agents", "tools")
    op.drop_column("organizations", "guardrails_enabled")
    op.drop_column("organizations", "monthly_token_limit")
