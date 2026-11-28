# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""OAuth identities, password resets, chat conversations, cloud-drive connectors, chat preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_identity_chat_connectors"
down_revision = "0007_governance_automation"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
NEW = ("user_identities", "password_resets", "cloud_connections", "conversations", "chat_messages")


def org():
    return sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


def ts(name, nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def upgrade():
    op.add_column("users", sa.Column("custom_instructions", sa.Text(), nullable=False, server_default=""))
    op.add_column("users", sa.Column("response_style", sa.String(20), nullable=False, server_default="balanced"))
    op.add_column("users", sa.Column("has_password", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("user_identities", sa.Column("id", UUID, primary_key=True),
                    sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("provider", sa.String(20), nullable=False), sa.Column("subject", sa.String(255), nullable=False),
                    sa.Column("email", sa.String(320), nullable=False), ts("created_at"),
                    sa.UniqueConstraint("provider", "subject", name="uq_identity_provider_subject"))
    op.create_table("password_resets", sa.Column("id", UUID, primary_key=True),
                    sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("token_hash", sa.String(64), nullable=False, unique=True), ts("expires_at"), ts("used_at", True), ts("created_at"))
    op.create_table("cloud_connections", sa.Column("id", UUID, primary_key=True), org(),
                    sa.Column("provider", sa.String(30), nullable=False), sa.Column("account_email", sa.String(320), nullable=False),
                    sa.Column("refresh_token_encrypted", sa.Text(), nullable=True), sa.Column("access_token_encrypted", sa.Text(), nullable=True),
                    ts("expires_at", True), sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True), ts("created_at"))
    op.add_column("knowledge_documents", sa.Column("external_connection_id", UUID, sa.ForeignKey("cloud_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("knowledge_documents", sa.Column("external_ref", sa.String(500), nullable=True))
    op.add_column("knowledge_documents", sa.Column("external_modified", sa.String(64), nullable=True))
    op.add_column("knowledge_documents", sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("conversations", sa.Column("id", UUID, primary_key=True), org(),
                    sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("title", sa.String(200), nullable=False), sa.Column("persona", sa.String(40), nullable=False),
                    sa.Column("connection_id", UUID, sa.ForeignKey("provider_connections.id", ondelete="SET NULL"), nullable=True),
                    sa.Column("model", sa.String(200), nullable=False),
                    sa.Column("collection_id", UUID, sa.ForeignKey("knowledge_collections.id", ondelete="SET NULL"), nullable=True),
                    sa.Column("pinned", sa.Boolean(), nullable=False), ts("created_at"), ts("updated_at"))
    op.create_table("chat_messages", sa.Column("id", UUID, primary_key=True),
                    sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("role", sa.String(20), nullable=False), sa.Column("content", sa.Text(), nullable=False),
                    sa.Column("attachments", JSONB, nullable=False), sa.Column("sources", JSONB, nullable=False),
                    sa.Column("model", sa.String(200), nullable=False), sa.Column("prompt_tokens", sa.Integer(), nullable=False),
                    sa.Column("completion_tokens", sa.Integer(), nullable=False), ts("created_at"))
    for t, cols in {"user_identities": ["user_id"], "password_resets": ["user_id"], "cloud_connections": ["organization_id"],
                    "conversations": ["organization_id", "user_id", "updated_at"], "chat_messages": ["conversation_id"]}.items():
        for c in cols:
            op.create_index(f"ix_{t}_{c}", t, [c])
    for t in NEW:
        op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$ DECLARE r text; BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.user_identities, public.password_resets, public.cloud_connections, public.conversations, public.chat_messages FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade():
    op.drop_table("chat_messages")
    op.drop_table("conversations")
    for c in ("synced_at", "external_modified", "external_ref", "external_connection_id"):
        op.drop_column("knowledge_documents", c)
    op.drop_table("cloud_connections")
    op.drop_table("password_resets")
    op.drop_table("user_identities")
    for c in ("has_password", "response_style", "custom_instructions"):
        op.drop_column("users", c)
