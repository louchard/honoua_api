import os
from sqlalchemy import text
from contextlib import contextmanager
from sqlalchemy import create_engine, text

__all__ = ["db_url", "get_engine", "smoke", "db_conn"]

def db_url() -> str:
    """Retourne l'URL de la BD: HONOUA_DB_URL si d?fini, sinon SQLite local."""
    return os.getenv("HONOUA_DB_URL") or "sqlite:///./local.db"

_engine = None

def get_engine():
    """Engine SQLAlchemy (lazy singleton)."""
    global _engine
    if _engine is None:
        _engine = create_engine(db_url(), future=True)
    return _engine

@contextmanager
def db_conn():
    """Contexte de connexion synchrone, utilisé par emissions_history."""
    eng = get_engine()
    with eng.connect() as conn:
        yield conn

def smoke() -> bool:
    """Retourne True si la DB répond à SELECT 1, False sinon."""
    try:
        eng = get_engine()
        with eng.connect() as conn:
            val = conn.execute(text("SELECT 1")).scalar_one()
        return val == 1          # <-- bool attendu par le test
    except Exception:
        return False