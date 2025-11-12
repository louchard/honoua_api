# app/db/__init__.py ? fa?ade simple pour les tests (sync)
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def db_url():
    return os.getenv('HONOUA_DB_URL', 'sqlite:///./local.db')

_engine = create_engine(db_url(), future=True)
SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False, future=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def smoke():
    try:
        with _engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        return True
    except Exception:
        return False

__all__ = ['get_db','db_url','smoke','SessionLocal']
