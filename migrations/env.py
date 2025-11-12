from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool
import os, sys

# Alembic Config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# S'assurer que /app est dans le PYTHONPATH pour importer 'app.*'
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Importer Base depuis le projet
try:
    from app.db.base import Base  # doit importer tous les modèles (side-effects)
except Exception:
    from app.db.base_class import Base

# === CIBLE POUR L'AUTOGENERATE ===
target_metadata = Base.metadata

def get_url():
    # Priorité à la variable d'env HONOUA_DB_URL, sinon alembic.ini
    env_url = os.getenv('HONOUA_DB_URL')
    if env_url:
        return env_url
    return config.get_main_option('sqlalchemy.url')

def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    conf = config.get_section(config.config_ini_section)
    conf['sqlalchemy.url'] = get_url()
    connectable = engine_from_config(
        conf,
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
