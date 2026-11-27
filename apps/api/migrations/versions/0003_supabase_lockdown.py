"""Keep application tables private from Supabase's auto-generated Data API.

Supabase exposes tables in the `public` schema through PostgREST to the `anon`
and `authenticated` roles. Galdus.ai accesses the database only from the
FastAPI server, so those roles must not read or write these tables. Enabling
row level security with no policies denies them by default; the revokes are
defence in depth. On plain PostgreSQL (no such roles) this migration only
enables RLS, which does not affect the table owner used by the API.
"""
from alembic import op

revision = "0003_supabase_lockdown"
down_revision = "0002_usage_events"
branch_labels = None
depends_on = None

TABLES = ("users", "organizations", "memberships", "usage_events", "alembic_version")


def upgrade():
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE public.users, public.organizations, public.memberships, public.usage_events, public.alembic_version FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade():
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
