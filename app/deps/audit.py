# app/deps/audit.py
from __future__ import annotations
from typing import Optional
from fastapi import Request
from sqlalchemy.orm import Session
from app.crud.audit_event import create_event


def audit(db: Session, event_type: str, message: str):
    """Enregistre un événement d’audit (synchrone)."""
    return create_event(db, event_type=event_type, message=message)


class AuditEvent:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def audit_from_request_sync(
    request: Request,
    db: Optional[Session] = None,
    event_type: str = "http_request",
    note: Optional[str] = None,
) -> AuditEvent:
    """
    Version unique — compatible production & CI.
    - Si `db` est fourni → enregistre l’événement réel.
    - Sinon → retourne un stub pour les tests.
    """
    user = getattr(request.state, "user", None)
    user_id = getattr(user, "id", "anonymous")
    message = f"user={user_id} | {note or event_type}"

    if db:
        audit(db, event_type, message)
    return AuditEvent(
        event_type=event_type,
        note=note,
        path=str(getattr(request, "url", getattr(request, "scope", {}))),
        method=getattr(request, "method", None),
        client=str(getattr(request, "client", None)),
        user=user_id,
    )


async def audit_from_request(
    request: Request,
    db: Optional[Session] = None,
    event_type: str = "http_request",
    note: Optional[str] = None,
) -> AuditEvent:
    """Version asynchrone compatible."""
    return audit_from_request_sync(request, db=db, event_type=event_type, note=note)
