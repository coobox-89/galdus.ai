# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Knowledge collections/documents/chunks (pgvector + full-text), agents and runs."""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0006_knowledge_agents"
down_revision = "0005_provider_connections"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TABLES = ("knowledge_collections", "knowledge_documents", "knowledge_chunks", "agents", "runs")


def org():
    return sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


def user_fk(name):
    return sa.Column(name, UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def upgrade():
    # On Supabase the extension is pre-installed by the project owner (schema "extensions");
    # IF NOT EXISTS makes this a no-op there.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "knowledge_collections",
        sa.Column("id", UUID, primary_key=True), org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("connection_id", UUID, sa.ForeignKey("provider_connections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("embedding_model", sa.String(200), nullable=True),
        user_fk("created_by"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "knowledge_documents",
        sa.Column("id", UUID, primary_key=True), org(),
        sa.Column("collection_id", UUID, sa.ForeignKey("knowledge_collections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("chars", sa.Integer(), nullable=False),
        sa.Column("chunks", sa.Integer(), nullable=False),
        sa.Column("embedded", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", UUID, primary_key=True), org(),
        sa.Column("collection_id", UUID, sa.ForeignKey("knowledge_collections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID, sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(), nullable=True),
        sa.Column("tsv", postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', content)", persisted=True)),
    )
    op.create_index("ix_knowledge_chunks_tsv", "knowledge_chunks", ["tsv"], postgresql_using="gin")
    op.create_table(
        "agents",
        sa.Column("id", UUID, primary_key=True), org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("connection_id", UUID, sa.ForeignKey("provider_connections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("collection_id", UUID, sa.ForeignKey("knowledge_collections.id", ondelete="SET NULL"), nullable=True),
        user_fk("created_by"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "runs",
        sa.Column("id", UUID, primary_key=True), org(), user_fk("user_id"),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("app_id", sa.String(60), nullable=True),
        sa.Column("trigger", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("input", sa.Text(), nullable=False),
        sa.Column("output", sa.Text(), nullable=False),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for t, cols in {"knowledge_collections": ["organization_id"], "knowledge_documents": ["organization_id", "collection_id"],
                    "knowledge_chunks": ["organization_id", "collection_id", "document_id"], "agents": ["organization_id"],
                    "runs": ["organization_id", "user_id", "agent_id", "created_at"]}.items():
        for c in cols:
            op.create_index(f"ix_{t}_{c}", t, [c])
    for t in TABLES:
        op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$ DECLARE r text; BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.knowledge_collections, public.knowledge_documents, public.knowledge_chunks, public.agents, public.runs FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade():
    for t in reversed(TABLES):
        op.drop_table(t)
