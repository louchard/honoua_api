from .base import Base  # re-export
__all__ = ["Base"]
# --- Compatibility helper for legacy imports ---
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncConnection
async def db_conn() -> AsyncConnection:
    # Provides an async SQLAlchemy connection (used by legacy routers expecting db_conn)
    from .session import engine
    return await engine.connect()
# --- Backward-compat alias for legacy imports ---
try:
    from .session import async_session as db_conn
except Exception:
    db_conn = None  # allows module import even if session init fails in CI
