"""merge heads before A39

Revision ID: bee001d0c28f
Revises: a38base_0001, b5e37f4effe0
Create Date: 2025-10-27 13:00:00
"""

from alembic import op
import sqlalchemy as sa

# Identifiants Alembic
revision = "bee001d0c28f"
down_revision = ("a38base_0001", "b5e37f4effe0")
branch_labels = None
depends_on = None

def upgrade():
    # merge only, nothing to do
    pass

def downgrade():
    # impossible to un-merge cleanly; leave as pass
    pass
