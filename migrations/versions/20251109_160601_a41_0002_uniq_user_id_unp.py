"""A41_0002 ? unicit? des pr?f?rences par user_id

Revision ID: 20251109_160601_a41_0002
Revises: e5222ce36723
Create Date: 2025-11-09T16:06:01

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '20251109_160601_a41_0002'
down_revision = 'e5222ce36723'
branch_labels = None
depends_on = None

def upgrade():
    # Index/contrainte unique (une seule ligne de pr?f?rences par user_id)
    op.create_unique_constraint('uq_unp_user_id', 'user_notification_preferences', ['user_id'])

def downgrade():
    op.drop_constraint('uq_unp_user_id', 'user_notification_preferences', type_='unique')
