"""A41 add notification channels

Revision ID: c1213a8650c9
Revises: a41_0002_uq_prefs_user
Create Date: 2025-11-13 12:30:41.826672
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c1213a8650c9"
down_revision = "a41_0002_uq_prefs_user"
branch_labels = None
depends_on = None


def upgrade():
    # Ajout des colonnes manquantes sur user_notification_preferences
    op.add_column(
        "user_notification_preferences",
        sa.Column("allow_email", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "user_notification_preferences",
        sa.Column("allow_push", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "user_notification_preferences",
        sa.Column("allow_sms", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "user_notification_preferences",
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    # Optionnel : si tu veux ensuite enlever les defaults côté DB
    # op.alter_column("user_notification_preferences", "allow_email", server_default=None)
    # op.alter_column("user_notification_preferences", "allow_push", server_default=None)
    # op.alter_column("user_notification_preferences", "allow_sms", server_default=None)
    # op.alter_column("user_notification_preferences", "updated_at", server_default=None)


def downgrade():
    # Suppression des colonnes ajoutées
    op.drop_column("user_notification_preferences", "updated_at")
    op.drop_column("user_notification_preferences", "allow_sms")
    op.drop_column("user_notification_preferences", "allow_push")
    op.drop_column("user_notification_preferences", "allow_email")
