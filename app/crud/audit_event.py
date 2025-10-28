# app/crud/audit_event.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_event import AuditEvent

async def create_event(db: AsyncSession, event_type: str, message: str) -> AuditEvent:
    evt = AuditEvent(event_type=event_type, message=message)
    db.add(evt)
    await db.commit()
    await db.refresh(evt)
    return evt

async def get_recent(db: AsyncSession, limit: int = 20):
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    result = await db.execute(stmt)      # ✅ important: await
    return list(result.scalars().all())  # liste Python
