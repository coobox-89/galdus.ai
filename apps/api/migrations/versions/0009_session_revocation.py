"""Session revocation: tokens issued before users.tokens_valid_after are rejected."""
from alembic import op
import sqlalchemy as sa

revision = "0009_session_revocation"
down_revision = "0008_identity_chat_connectors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tokens_valid_after", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "tokens_valid_after")
