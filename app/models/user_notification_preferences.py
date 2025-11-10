from __future__ import annotations

from enum import Enum
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Enum as SAEnum

from app.db.base import Base  # Base déclarative SQLAlchemy v2


class NotificationFrequency(str, Enum):
    immediate = "immediate"
    daily = "daily"
    weekly = "weekly"


class UserNotificationPreferences(Base):
    __tablename__ = "user_notification_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    # Enum SQLAlchemy nommé (doit matcher la migration A41)
    frequency: Mapped[NotificationFrequency] = mapped_column(
        SAEnum(NotificationFrequency, name="notification_frequency"),
        default=NotificationFrequency.immediate,
    )
    # Stockage simple sous forme de chaîne (CSV) – compatible avec le code routeur actuel
    types: Mapped[str] = mapped_column(String, default="")
    last_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)