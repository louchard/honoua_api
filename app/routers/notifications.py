# app/routers/notifications.py

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import get_db
from app.schemas.notification_preferences import (
    NotificationPreferencesRead,
    NotificationPreferencesCreate,
    NotificationPreferencesUpdate,
)
from app.crud.notification_preferences import (
    get_by_user,
    create_default,
    create_or_update,
    update_partial,
)
from app.services.notification_sender import send_notification

router = APIRouter(tags=["notifications"])

# UUID fixe pour tests/développement
FAKE_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


@router.get("/preferences", response_model=NotificationPreferencesRead)
def read_preferences(db: Session = Depends(get_db)):
    """
    Retourne les préférences de notification de l'utilisateur courant (mock).
    Crée un enregistrement par défaut si inexistant.
    """
    prefs = get_by_user(db, user_id=FAKE_USER_ID)
    if prefs is None:
        prefs = create_default(db, user_id=FAKE_USER_ID)
    return prefs


@router.post("/preferences", response_model=NotificationPreferencesRead)
def write_preferences(
    data: NotificationPreferencesCreate,
    db: Session = Depends(get_db),
):
    """
    Écriture complète des préférences.
    L'user_id envoyé par le client est ignoré : on force FAKE_USER_ID.
    """
    data.user_id = FAKE_USER_ID
    prefs = create_or_update(db, user_id=FAKE_USER_ID, data=data)
    return prefs


@router.patch("/preferences", response_model=NotificationPreferencesRead)
def patch_preferences(
    data: NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
):
    """
    Mise à jour partielle des préférences (PATCH-like).
    """
    prefs = update_partial(db, user_id=FAKE_USER_ID, data=data)
    return prefs


class NotificationSendRequest(BaseModel):
    message: str
    type: str = "info"  # libre : info / alert / success / warning


@router.post("/send")
def send_notification_mock(
    payload: NotificationSendRequest,
    db: Session = Depends(get_db),
):
    """
    Envoi mocké d'une notification locale.
    Vérifie les préférences, puis appelle le service mock.
    """
    user_id = FAKE_USER_ID

    # Récupération préférences
    prefs = get_by_user(db, user_id=user_id)
    if prefs is None:
        prefs = create_default(db, user_id=user_id)

    # Vérification basique : si notifications désactivées
    if not prefs.enabled:
        return {
            "status": "blocked",
            "reason": "Notifications disabled for this user",
        }

    # Appel du mock
    result = send_notification(
        user_id=user_id,
        message=payload.message,
        notif_type=payload.type,
    )

    return {
        "status": "sent",
        "user_id": str(user_id),
        "message": payload.message,
        "type": payload.type,
        "service_result": result,
    }
