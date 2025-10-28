from alembic import op
import sqlalchemy as sa

# Identifiants Alembic
revision = "2f1c3a4b5d6e"          # ← garde cet ID (vient du nom du fichier)
down_revision = "bee001d0c28f"      # ← merge_heads_before_a39 (pivot unique avant A39)
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("message", sa.String(length=512), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])

def downgrade():
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_table("audit_events")
