from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.orm import Session  # ← remplace AsyncSession

from app.schemas.audit_event import AuditEventRead
from app.crud.audit_event import get_recent
from app.deps.db import get_db      # ← remplace app.api.deps
try:
    from app.core.logger import logger
except ModuleNotFoundError:
    from ..core.logger import logger

router = APIRouter(prefix="/logs", tags=["logs"])

@router.get("/recent", response_model=List[AuditEventRead])
async def get_recent_logs(limit: int = 20, db: Session = Depends(get_db)):  # ← Session
    logger.info("GET /logs/recent called")
    limit = limit if 1 <= limit <= 100 else 20
    events = get_recent(db, limit=limit)
    return events
    