"""A38 — Création des tables token_ledger et token_blacklist"""

from alembic import op
import sqlalchemy as sa

# Identifiants de révision
revision = "a38_token_tables_1"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "token_ledger",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False, unique=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_jti", sa.String(length=64), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(length=255), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_token_ledger_user_id", "token_ledger", ["user_id"], unique=False)
    op.create_index("ix_token_ledger_jti", "token_ledger", ["jti"], unique=True)

    op.create_table(
        "token_blacklist",
        sa.Column("jti", sa.String(length=64), primary_key=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
    )

def downgrade():
    op.drop_table("token_blacklist")
    op.drop_index("ix_token_ledger_jti", table_name="token_ledger")
    op.drop_index("ix_token_ledger_user_id", table_name="token_ledger")
    op.drop_table("token_ledger")
