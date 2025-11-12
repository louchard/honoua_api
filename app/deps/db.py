# Simple proxy de compatibilit? : on r?-exporte get_db (synchrone)
from app.db import get_db
from app.db.session import SessionLocal  # facultatif si utilis? ailleurs
__all__ = ["get_db", "SessionLocal"]
