import os
from sqlalchemy import create_engine, text

__all__ = ["db_url", "get_engine", "smoke"]

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

def smoke() -> int:
    """Ex?cute SELECT 1 et retourne 1 si OK (utilis? par les tests CI)."""
    eng = get_engine()
    with eng.connect() as conn:
        val = conn.execute(text("SELECT 1")).scalar_one()
        return int(val)
