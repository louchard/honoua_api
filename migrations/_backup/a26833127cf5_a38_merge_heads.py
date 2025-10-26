"""A38: merge heads

Revision ID: a26833127cf5
Revises: a38_token_tables_1, b5e37f4effe0
Create Date: 2025-10-26 14:23:27.666324

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a26833127cf5'
down_revision = "('a38_token_tables_1', 'b5e37f4effe0')"
branch_labels = 'None'
depends_on = 'None'

def upgrade():
    pass

def downgrade():
    pass
