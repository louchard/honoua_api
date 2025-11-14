"""A41 user groups tables

Revision ID: 70eaaff91264
Revises: 2f1c3a4b5d6e
Create Date: 2025-10-29 14:51:58.113392

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '70eaaff91264'
down_revision = '2f1c3a4b5d6e'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Tables A41 : groupes utilisateurs et sessions associées
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_groups (
            id BIGSERIAL PRIMARY KEY,
            owner_id TEXT,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.user_group_sessions (
            group_id BIGINT NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
            session_id TEXT NOT NULL,
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (group_id, session_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.user_group_sessions;")
    op.execute("DROP TABLE IF EXISTS public.user_groups;")
