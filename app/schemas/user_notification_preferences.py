from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID

# ⚠️ Aligné avec l'ENUM SQLAlchemy "notification_frequency"
NotificationFrequency = Literal["immediate", "hourly", "daily", "weekly"]

class UserNotificationPreferencesBase(BaseModel):
    enabled: bool = Field(default=True, description="Activation globale des notifications")
    frequency: NotificationFrequency = Field(default="immediate", description="Fréquence des notifications")
    types: List[str] = Field(default_factory=list, description="Types de notifications (ex: summary, compare, alert_low_co2)")

class UserNotificationPreferencesCreate(UserNotificationPreferencesBase):
    # user_id sera géré côté service (contexte auth)
    pass

class UserNotificationPreferencesUpdate(BaseModel):
    enabled: Optional[bool] = Field(default=None)
    frequency: Optional[NotificationFrequency] = Field(default=None)
    types: Optional[List[str]] = Field(default=None)

class UserNotificationPreferencesRead(UserNotificationPreferencesBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: UUID  # UUID -> str côté API
    last_notified_at: Optional[datetime] = None