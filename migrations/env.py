import os, sys
from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool, create_engine  # ← sync engine
# (on ne importe plus create_async_engine)

# --- chemins facultatifs (ok tels quels) ---
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(ROOT_DIR, "app")
for p in (ROOT_DIR, APP_DIR):
    if p not in sys.path:
        sys.path.append(p)

HONOUA_DB_URL = os.getenv("HONOUA_DB_URL")
config = context.config
if HONOUA_DB_URL:
    config.set_main_option("sqlalchemy.url", HONOUA_DB_URL)

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = None  # on n'utilise pas d'autogénération

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = create_engine(  # ← moteur SYNC
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

def run_migrations():
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        run_migrations_online()

run_migrations()
