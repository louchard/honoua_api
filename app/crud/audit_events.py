"""A39b — rename audit_event -> audit_events"""

from alembic import op
import sqlalchemy as sa  # noqa: F401  (garde pour cohérence avec Alembic)

# revision identifiers, used by Alembic.
revision = "a39b_0001_rename"
down_revision = "bee001d0c28f"  # ← le merge head atteint après A39 et A36
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table("audit_event", "audit_events")


def downgrade():
    op.rename_table("audit_events", "audit_event")
