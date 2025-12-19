from __future__ import annotations
from uuid import UUID
import enum
from datetime import datetime
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base_class import Base

class GUID(TypeDecorator):
    """
    UUID portable :
    - PostgreSQL -> UUID natif
    - SQLite/Autres -> CHAR(36)
    """
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, UUID):
            value = UUID(str(value))
        return value if dialect.name == "postgresql" else str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        # Important : accepter un int "historique" en SQLite sans crash
        if isinstance(value, int):
            return UUID(int=value)
        return value if isinstance(value, UUID) else UUID(str(value))

class NotificationFrequency(str, enum.Enum):
    immediate = "immediate"
    hourly = "hourly"
    daily = "daily"
    weekly = "weekly"


class NotificationPreferences(Base):
    __tablename__ = "user_notification_preferences"

    id = Column(Integer, primary_key=True, index=True)

    # 🔴 IMPORTANT : UUID en base → UUID ici aussi
    user_id = Column(GUID(), nullable=False, index=True)

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
