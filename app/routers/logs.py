# app/routers/logs.py

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.crud.audit_event import get_recent
from app.schemas.audit_event import AuditEventRead

import logging

logger = logging.getLogger("honoua")

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/recent", response_model=List[AuditEventRead])
def get_recent_logs(limit: int = 20, db: Session = Depends(get_db)):
    logger.info("GET /logs/recent called (limit=%s)", limit)
    try:
        events = get_recent(db, limit=limit)
        return events
    except Exception:
        logger.exception("GET /logs/recent failed")
        raise
