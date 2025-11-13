from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.notification_preferences import NotificationFrequency


class NotificationPreferencesBase(BaseModel):
    enabled: bool = True
    frequency: NotificationFrequency = NotificationFrequency.immediate
    types: Optional[List[str]] = Field(
        default=None,
        description="Liste de types/labels de notifications",
    )
    last_notified_at: Optional[datetime] = None
    allow_email: bool = True
    allow_push: bool = True
    allow_sms: bool = False


class NotificationPreferencesCreate(NotificationPreferencesBase):
    """
    Schéma utilisé pour créer / définir les préférences d'un utilisateur.
    Ici user_id est un UUID, comme en base.
    """
    user_id: UUID


class NotificationPreferencesUpdate(BaseModel):
    """
    Mise à jour partielle (PATCH-like).
    """
    enabled: Optional[bool] = None
    frequency: Optional[NotificationFrequency] = None
    types: Optional[List[str]] = Field(
        default=None,
        description="Liste de types/labels de notifications",
    )
    last_notified_at: Optional[datetime] = None
    allow_email: Optional[bool] = None
    allow_push: Optional[bool] = None
    allow_sms: Optional[bool] = None


class NotificationPreferencesRead(NotificationPreferencesBase):
    id: int
    user_id: UUID
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
