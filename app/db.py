# app/db.py
from __future__ import annotations
import os
from contextlib import contextmanager
from typing import Iterator

# Dépendances : SQLAlchemy (>=2.0) + psycopg (>=3) pour Postgres
# - Si HONOUA_DB_URL commence par "postgres", on utilisera psycopg.
# - Sinon, on bascule en SQLite local (honoua.db).
try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import Engine
except Exception as e:  # pragma: no cover
    raise RuntimeError(
        "SQLAlchemy est requis pour app/db.py. Installez-le (ex: pip install SQLAlchemy psycopg[binary])."
    ) from e


def _default_sqlite_url() -> str:
    # Fichier SQLite à la racine du dépôt
    return "sqlite:///honoua.db"


def db_url() -> str:
    """Retourne l'URL de connexion (env DATABASE_URL/HONOUA_DB_URL ou fallback SQLite)."""
    url = (os.getenv("DATABASE_URL", "") or os.getenv("HONOUA_DB_URL", "")).strip()

    # Railway fournit souvent postgres:// ; SQLAlchemy + psycopg préfèrent postgresql+psycopg://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql+psycopg2://", 1)


    return url if url else _default_sqlite_url()



def make_engine() -> "Engine":
    """
    Crée un Engine SQLAlchemy :
    - Postgres si HONOUA_DB_URL est défini (postgres:// ou postgresql://)
    - Sinon SQLite (fichier local honoua.db)
    """
    url = db_url()

    # Options robustes : reconnexions, pre_ping, timeouts raisonnables
    common_kwargs = dict(pool_pre_ping=True)

    if url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://", "postgresql+psycopg2://")):

        # psycopg3 est recommandé (SQLAlchemy détecte le driver via l'URL)
        # Ex : HONOUA_DB_URL=postgresql+psycopg://user:pass@localhost:5432/honoua
        #      HONOUA_DB_URL=postgresql://user:pass@host/db  (auto-driver si dispo)
        return create_engine(url, **common_kwargs)
    else:
        # SQLite local
        # check_same_thread=False pour usage éventuel en contexte async/threaded simple
        return create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}, **common_kwargs)


ENGINE: "Engine" = make_engine()


@contextmanager
def db_conn() -> Iterator:
    """Context manager connexion brute (pour requêtes simples)."""
    conn = ENGINE.connect()
    try:
        yield conn
    finally:
        conn.close()


def smoke() -> bool:
    """
    Smoke test rapide : exécuter un SELECT 1 qui marche partout (PG/SQLite).
    Retourne True si succès.
    """
    try:
        with db_conn() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
