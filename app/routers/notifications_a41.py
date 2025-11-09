from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session  # adapte si ton projet expose ce dep ailleurs
from app.models.user_notification_preferences import (
    UserNotificationPreferences,
    NotificationFrequency as SA_NotificationFrequency,  # ENUM SQLAlchemy si besoin
)
try:
    from app.core.logger import logger
except ModuleNotFoundError:
    from ..core.logger import logger
from app.schemas.user_notification_preferences import (
    UserNotificationPreferencesRead,
    UserNotificationPreferencesUpdate,
    UserNotificationPreferencesCreate,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/preferences", response_model=UserNotificationPreferencesRead)
async def get_preferences(
    user_id: UUID,
    session: AsyncSession = Depends(get_async_session),
):
    """
    Récupère les préférences de notifications d'un utilisateur.
    Si aucune préférence n'existe encore, crée une ligne par défaut (enabled=True, frequency='immediate', types=[]).
    """
    res = await session.execute(
        select(UserNotificationPreferences).where(UserNotificationPreferences.user_id == user_id)
    )
    prefs = res.scalar_one_or_none()
    if prefs is None:
        prefs = UserNotificationPreferences(
            user_id=user_id,
            enabled=True,
            # default 'immediate' conforme au server_default de la table
            frequency=SA_NotificationFrequency.immediate,
            types=[],
            last_notified_at=None,
        )
        session.add(prefs)
        await session.commit()
        await session.refresh(prefs)

    return UserNotificationPreferencesRead.model_validate(prefs)


@router.put("/preferences", response_model=UserNotificationPreferencesRead, status_code=status.HTTP_200_OK)
async def put_preferences(
    user_id: UUID,
    payload: UserNotificationPreferencesUpdate,
    session: AsyncSession = Depends(get_async_session),
):
    """
    Met à jour les préférences (mise à jour partielle).
    Crée une ligne par défaut si elle n'existe pas encore.
    """
    res = await session.execute(
        select(UserNotificationPreferences).where(UserNotificationPreferences.user_id == user_id)
    )
    prefs = res.scalar_one_or_none()

    if prefs is None:
        # créer des prefs par défaut puis appliquer le patch
        prefs = UserNotificationPreferences(
            user_id=user_id,
            enabled=True,
            frequency=SA_NotificationFrequency.immediate,
            types=[],
            last_notified_at=None,
        )
        session.add(prefs)
        await session.flush()

    # applique seulement les champs fournis
    if payload.enabled is not None:
        prefs.enabled = payload.enabled
    if payload.frequency is not None:
        # pydantic garantit la valeur parmi ["immediate","hourly","daily","weekly"]
        prefs.frequency = SA_NotificationFrequency(payload.frequency)
    if payload.types is not None:
        prefs.types = payload.types

    await session.commit()
    await session.refresh(prefs)
    return UserNotificationPreferencesRead.model_validate(prefs)


class NotificationTestPayload(BaseModel):
    title: str
    body: str | None = None
    type: str | None = None  # ex: 'summary' | 'compare' | ...

@router.post("/test")
async def notifications_test(
    user_id: UUID,
    payload: NotificationTestPayload,
    session: AsyncSession = Depends(get_async_session),
):
    # 1) Charger (ou cr?er) les pr?f?rences
    from sqlalchemy import select, desc
    res = await session.execute(
        select(UserNotificationPreferences).where(UserNotificationPreferences.user_id == user_id)
    )
    prefs = res.scalar_one_or_none()
    if prefs is None:
        prefs = UserNotificationPreferences(
            user_id=user_id,
            enabled=True,
            frequency=SA_NotificationFrequency.immediate,
            types=[],
            last_notified_at=None,
        )
        session.add(prefs)
        await session.flush()

    # 2) V?rifier si notifications activ?es
    if not prefs.enabled:
        raise HTTPException(status_code=400, detail="Notifications d?sactiv?es pour cet utilisateur")

    # 3) Simuler 'envoi' d'une notification (log)
    logger.info(f"[A41:test] Notify user={user_id} title={payload.title!r} body={payload.body!r} type={payload.type!r}")

    # 4) Mettre ? jour last_notified_at
    prefs.last_notified_at = datetime.utcnow()
    await session.commit()
    await session.refresh(prefs)

    return {
        "sent": True,
        "to_user_id": str(user_id),
        "title": payload.title,
        "body": payload.body,
        "type": payload.type,
        "last_notified_at": (prefs.last_notified_at.isoformat() if prefs.last_notified_at else None),
    }
