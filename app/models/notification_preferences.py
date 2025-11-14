from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base_class import Base


class NotificationFrequency(str, enum.Enum):
    immediate = "immediate"
    hourly = "hourly"
    daily = "daily"
    weekly = "weekly"


class NotificationPreferences(Base):
    __tablename__ = "user_notification_preferences"

    id = Column(Integer, primary_key=True, index=True)

    # 🔴 IMPORTANT : UUID en base → UUID ici aussi
    user_id = Column(PG_UUID(as_uuid=True), nullable=False, index=True)

    # Activation globale des notifications
    enabled = Column(Boolean, nullable=False, default=True)

    # Fréquence d'envoi (Enum)
    frequency = Column(
        SAEnum(NotificationFrequency, name="notification_frequency"),
        nullable=False,
        default=NotificationFrequency.immediate,
    )

    # Types / labels de notifications activés
    types = Column(JSON, nullable=True, server_default="[]")

    # Dernière notification émise
    last_notified_at = Column(DateTime(timezone=True), nullable=True)

    # Canaux autorisés
    allow_email = Column(Boolean, nullable=False, default=True)
    allow_push = Column(Boolean, nullable=False, default=True)
    allow_sms = Column(Boolean, nullable=False, default=False)

    # Suivi de mise à jour
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    def __repr__(self) -> str:
        return (
            f"<NotificationPreferences("
            f"id={self.id}, user_id={self.user_id}, "
            f"enabled={self.enabled}, frequency={self.frequency}, "
            f"email={self.allow_email}, push={self.allow_push}, sms={self.allow_sms}"
            f")>"
        )
