# app/crud/audit_event.py

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


async def create_event(db: AsyncSession, event_type: str, message: str) -> AuditEvent:
    """
    Création d'un événement d'audit en mode async.
    À utiliser dans un contexte où tu as un AsyncSession.
    """
    evt = AuditEvent(event_type=event_type, message=message)
    db.add(evt)
    await db.commit()
    await db.refresh(evt)
    return evt


def get_recent(db: Session, limit: int = 20) -> List[AuditEvent]:
    """
    Retourne les derniers événements d'audit (ordre décroissant).
    Fonction synchrone, utilisée par le router /logs/recent.
    """
    stmt = (
        select(AuditEvent)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )
    result = db.execute(stmt)
    return list(result.scalars().all())
