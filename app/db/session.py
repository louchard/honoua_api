from __future__ import annotations
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DB_URL = os.getenv('HONOUA_DB_URL', 'sqlite:///./local.db')
engine = create_engine(DB_URL, pool_pre_ping=True, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
Base = declarative_base()


# --- compatibility alias for legacy imports ---
async_session = None


# --- compatibility shim for legacy imports ---
def async_session():
    # Delayed import to avoid circular deps
    from app.deps.db import get_db
    return get_db()

