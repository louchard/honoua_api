# app/db/__init__.py
import os
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy import text
from sqlalchemy import select
import asyncio 

from .session import engine, async_session  # moteur & fabrique de sessions

# === Compatibilité legacy (anciens imports) ===
ENGINE: AsyncEngine = engine

@asynccontextmanager
async def db_conn():
    """Compat pour: `from app.db import db_conn`"""
    async with engine.begin() as conn:
        yield conn

# === Exigences des tests ===
# === Exigences des tests ===
def db_url() -> str | None:
    """Fonction appelable attendue par les tests."""
    import os
    return os.getenv("HONOUA_DB_URL")

async def _async_smoke() -> None:
    async with async_session() as s:
        await s.execute(select(1))

def smoke() -> bool:
    """
    Version synchrone pour les tests (appelée sans await).
    Retourne True si le round-trip SELECT 1 réussit, sinon False.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Cas rare en test : crée une nouvelle boucle dédiée
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(_async_smoke())
            finally:
                new_loop.close()
        else:
            loop.run_until_complete(_async_smoke())
    except Exception:
        return False
    return True



__all__ = ["ENGINE", "engine", "async_session", "db_conn", "db_url", "smoke"]

from .base import Base as Base
