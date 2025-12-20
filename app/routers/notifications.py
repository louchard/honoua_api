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
def read_preferences(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    prefs = get_by_user(db, user_id=user_id)
    if prefs is None:
        prefs = create_default(db, user_id=user_id)
    return prefs


@router.post("/preferences", response_model=NotificationPreferencesRead)
def write_preferences(
    user_id: UUID,
    payload: NotificationPreferencesCreate,
    db: Session = Depends(get_db),
):
    # On force l'UUID du query param (référence test)
    payload.user_id = user_id
    prefs = create_or_update(db, user_id=user_id, data=payload)
    return prefs


@router.patch("/preferences", response_model=NotificationPreferencesRead)
def patch_preferences(
    payload: NotificationPreferencesUpdate,
    user_id: UUID = FAKE_USER_ID,
    db: Session = Depends(get_db),
):
    prefs = update_partial(db, user_id=user_id, data=payload)
    return prefs

class SendNotificationPayload(BaseModel):
    message: str
    type: str


@router.post("/send")
def send_notification_mock(
    payload: dict,
    user_id: UUID = FAKE_USER_ID,
):
    message = payload.get("message")
    notif_type = payload.get("type")

    result = send_notification(
        user_id=user_id,
        message=message,
        notif_type=notif_type,
    )

    return {
        "status": "sent",
        "user_id": str(user_id),
        "message": message,
        "type": notif_type,
        "service_result": result,
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
