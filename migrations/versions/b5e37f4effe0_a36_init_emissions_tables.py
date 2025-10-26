"""A36 init emissions tables

Revision ID: b5e37f4effe0
Revises:
Create Date: 2025-10-23

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b5e37f4effe0"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === Table: emission_factors ===
    op.create_table(
        "emission_factors",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("category_code", sa.Text, nullable=False),
        sa.Column("unit", sa.Text, nullable=False),  # g, kg, ml, l, piece
        sa.Column("factor_gco2e_per_unit", sa.Numeric(18, 6), nullable=False),
        sa.Column("source", sa.Text, nullable=True),
        sa.Column("version", sa.Text, nullable=True),
        sa.Column("valid_from", sa.Date, nullable=True),
        sa.Column("valid_to", sa.Date, nullable=True),
    )

    op.create_index(
        "ix_emission_factors_cat_unit_valid",
        "emission_factors",
        ["category_code", "unit", "valid_from", "valid_to"],
        unique=False,
    )

    op.create_check_constraint(
        "ck_emission_factors_unit",
        "emission_factors",
        "unit in ('g','kg','ml','l','piece')",
    )

    # === Table: emission_calculations ===
    op.create_table(
        "emission_calculations",
        sa.Column("id", sa.Text, primary_key=True),  # UUID string (généré côté app)
        sa.Column("product_id", sa.Text, nullable=True),
        sa.Column("category_code", sa.Text, nullable=False),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False),
        sa.Column("quantity_unit", sa.Text, nullable=False),  # g, kg, ml, l, piece
        sa.Column("normalized_qty", sa.Numeric(18, 6), nullable=False),
        sa.Column(
            "factor_id",
            sa.BigInteger,
            sa.ForeignKey("emission_factors.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("emissions_gco2e", sa.Numeric(18, 6), nullable=False),
        sa.Column(
            "method",
            sa.Text,
            nullable=False,
            server_default=sa.text("'direct_factor'"),
        ),
        sa.Column("session_id", sa.Text, nullable=True),
        sa.Column("idempotency_key", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_emission_calculations_product_created",
        "emission_calculations",
        ["product_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_emission_calculations_session",
        "emission_calculations",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_emission_calculations_category",
        "emission_calculations",
        ["category_code"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_emission_calculations_idem",
        "emission_calculations",
        ["idempotency_key"],
    )
    op.create_check_constraint(
        "ck_emission_calculations_unit",
        "emission_calculations",
        "quantity_unit in ('g','kg','ml','l','piece')",
    )


def downgrade() -> None:
    # emission_calculations (drop in reverse order)
    op.drop_constraint(
        "ck_emission_calculations_unit",
        "emission_calculations",
        type_="check",
    )
    op.drop_constraint(
        "uq_emission_calculations_idem",
        "emission_calculations",
        type_="unique",
    )
    op.drop_index(
        "ix_emission_calculations_category",
        table_name="emission_calculations",
    )
    op.drop_index(
        "ix_emission_calculations_session",
        table_name="emission_calculations",
    )
    op.drop_index(
        "ix_emission_calculations_product_created",
        table_name="emission_calculations",
    )
    op.drop_table("emission_calculations")
    # emission_factors
    op.drop_constraint(
        "ck_emission_factors_unit",
        "emission_factors",
        type_="check",
    )
    op.drop_index(
        "ix_emission_factors_cat_unit_valid",
        table_name="emission_factors",
    )
    op.drop_table("emission_factors")
