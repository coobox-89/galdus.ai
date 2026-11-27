"""First-run tour: remember on the account whether the person finished or skipped it."""
from alembic import op
import sqlalchemy as sa

revision = "0011_onboarding_tour"
down_revision = "0010_mfa_profile_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL: the tour has not been finished or skipped yet, so the console offers it at the next sign-in.
    op.add_column("users", sa.Column("onboarding_status", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "onboarding_status")
