#!/bin/sh
set -e
# Aller dans le code API
cd /app

# 1) Arborescence Alembic attendue (script_location = migrations)
mkdir -p migrations/versions

# 2) Cr?er env.py minimal si absent
if [ ! -f migrations/env.py ]; then
cat > migrations/env.py <<'EOF'
from __future__ import annotations
import os
from logging.config import fileConfig
from sqlalchemy import create_engine
from alembic import context

config = context.config
if config.config_file_name and os.path.exists(config.config_file_name):
    fileConfig(config.config_file_name)

# Pas d'autogenerate pour l'instant
target_metadata = None

def get_url():
    # Utilise l'URL d?finie dans alembic.ini (sqlalchemy.url)
    return config.get_main_option("sqlalchemy.url")

def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = create_engine(get_url())
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
EOF
fi

# 3) Cr?er le template de r?vision si absent
if [ ! -f migrations/script.py.mako ]; then
cat > migrations/script.py.mako <<'EOF'
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = ${up_revision | repr}
down_revision = ${down_revision | repr}
branch_labels = ${branch_labels | repr}
depends_on = ${depends_on | repr}

def upgrade():
    ${upgrades if upgrades else "pass"}

def downgrade():
    ${downgrades if downgrades else "pass"}
EOF
fi

# 4) S'assurer qu'Alembic est install? puis appliquer toutes les migrations
command -v alembic >/dev/null 2>&1 || pip install --no-input alembic
alembic upgrade head

# 5) V?rifier les tables token_* c?t? Postgres (installe psql si besoin)
command -v psql >/dev/null 2>&1 || (apk add --no-cache postgresql-client >/dev/null 2>&1 || true)
PGPASSWORD="Honou2025Lg!" psql -h postgres -U honou -d honoua -c "\dt token_*"