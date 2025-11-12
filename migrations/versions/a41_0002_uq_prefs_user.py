"""A41_0002 - UNIQUE(user_id) idempotent on user_notification_preferences"""

from alembic import op

revision = 'a41_0002_uq_prefs_user'
down_revision = '20251109_160601_a41_0002'
branch_labels = None
depends_on = None

def upgrade():
    # Drop ?ventuels puis cr?ation propre (idempotent)
    op.execute("""
    DO $$
    BEGIN
        -- supprime la contrainte si elle existe d?j?
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE c.conname = 'uq_user_notification_preferences_user_id'
              AND t.relname = 'user_notification_preferences'
        ) THEN
            ALTER TABLE user_notification_preferences
            DROP CONSTRAINT uq_user_notification_preferences_user_id;
        END IF;

        -- supprime un index orphelin du m?me nom si pr?sent
        IF EXISTS (
            SELECT 1 FROM pg_class
            WHERE relname = 'uq_user_notification_preferences_user_id'
              AND relkind = 'i'
        ) THEN
            DROP INDEX IF EXISTS uq_user_notification_preferences_user_id;
        END IF;

        -- (re)cr?e la contrainte UNIQUE
        ALTER TABLE user_notification_preferences
        ADD CONSTRAINT uq_user_notification_preferences_user_id UNIQUE (user_id);
    END$$;
    """)

def downgrade():
    op.execute("""
        ALTER TABLE user_notification_preferences
        DROP CONSTRAINT IF EXISTS uq_user_notification_preferences_user_id;
    """)
