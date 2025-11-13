# app/crud/notification_preferences.py

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification_preferences import NotificationPreferences
from app.schemas.notification_preferences import (
    NotificationPreferencesCreate,
    NotificationPreferencesUpdate,
)


def get_by_user(db: Session, user_id: UUID) -> NotificationPreferences | None:
    """
    Récupère les préférences de notification d'un utilisateur.
    """
    return (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.user_id == user_id)
        .first()
    )


def create_default(db: Session, user_id: UUID) -> NotificationPreferences:
    """
    Crée un objet de préférences par défaut pour un utilisateur.
    """
    prefs = NotificationPreferences(
        user_id=user_id,
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
    prefs = get_by_user(db, user_id=user_id)
    if prefs is None:
        prefs = NotificationPreferences(user_id=user_id)

    for field, value in data.model_dump().items():
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
    prefs = get_by_user(db, user_id=user_id)
    if prefs is None:
        prefs = create_default(db, user_id=user_id)

    updates = data.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(prefs, field, value)

    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs
