from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import TypeAdapter

from app.schemas.audit_event import AuditEventRead
from app.crud.audit_event import get_recent
from app.core.logger import logger

# 🔁 adapte l'import ci-dessous à TON chemin réel :
from app.deps.db import get_db  # ← si différent, corrige ici

router = APIRouter(prefix="/logs", tags=["logs"])
_adapter = TypeAdapter(List[AuditEventRead])

@router.get("/recent", response_model=List[AuditEventRead])
async def get_recent_logs(limit: int = 20, db: AsyncSession = Depends(get_db)):
    try:
        l = 20 if not (1 <= limit <= 100) else limit
        logger.info("GET /logs/recent called (limit=%s)", l)
        events = await get_recent(db, limit=l)
        # Validation explicite pour éviter 500 liés à ORM/Pydantic
        return _adapter.validate_python(events)
    except Exception:
        logger.exception("GET /logs/recent failed")
        raise
