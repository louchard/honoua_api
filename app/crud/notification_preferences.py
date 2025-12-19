# app/crud/notification_preferences.py

from uuid import UUID
from typing import Any

from sqlalchemy.orm import Session

from app.models.notification_preferences import NotificationPreferences
from app.schemas.notification_preferences import (
    NotificationPreferencesCreate,
    NotificationPreferencesUpdate,
)


from uuid import UUID
from typing import Any

def _normalize_user_id(user_id: Any) -> UUID:
    """
    Garantit un UUID pour les opérations DB.
    - UUID -> ok
    - int (ex: UUID.int) -> reconverti en UUID
    - str -> parsé en UUID
    """
    if isinstance(user_id, UUID):
        return user_id
    if isinstance(user_id, int):
        return UUID(int=user_id)
    return UUID(str(user_id))



def get_by_user(db: Session, user_id: UUID) -> NotificationPreferences | None:
    """
    Récupère les préférences de notification d'un utilisateur.
    """
    user_id_uuid = _normalize_user_id(user_id)
    return (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.user_id == user_id_uuid)
        .first()
    )

def create_default(db: Session, user_id: UUID) -> NotificationPreferences:
    """
    Crée un objet de préférences par défaut pour un utilisateur.
    """
    user_id_uuid = _normalize_user_id(user_id)

    prefs = NotificationPreferences(
        user_id=user_id_uuid,
        enabled=True,
        allow_email=True,
        allow_push=True,
        allow_sms=False,
        frequency="immediate",
        types=[],
    )
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs

def create_or_update(
    db: Session,
    user_id: UUID,
    data: NotificationPreferencesCreate,
) -> NotificationPreferences:
    """
    Création ou mise à jour complète des préférences utilisateur.
    """
    user_id_uuid = _normalize_user_id(user_id)

    prefs = get_by_user(db, user_id=user_id_uuid)
    if prefs is None:
        prefs = NotificationPreferences(user_id=user_id_uuid)

    # On empêche toute réécriture incorrecte de user_id
    payload = data.model_dump()
    payload["user_id"] = user_id_uuid

    for field, value in payload.items():
        setattr(prefs, field, value)

    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs


def update_partial(
    db: Session,
    user_id: UUID,
    data: NotificationPreferencesUpdate,
) -> NotificationPreferences:
    """
    Mise à jour partielle (PATCH-like).
    """
    user_id_uuid = _normalize_user_id(user_id)

    prefs = get_by_user(db, user_id=user_id_uuid)
    if prefs is None:
        prefs = create_default(db, user_id=user_id_uuid)

    updates = data.model_dump(exclude_unset=True)

    # Sécurité : si jamais user_id apparaît, on le force au bon UUID
    if "user_id" in updates:
        updates["user_id"] = user_id_uuid

    for field, value in updates.items():
        setattr(prefs, field, value)

    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs

