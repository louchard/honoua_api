from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base_class import Base

# Doit correspondre exactement au type cr?? par la migration a41_0001:
# name='notification_frequency' avec les 4 valeurs ci-dessous.
NotificationFrequencyEnum = sa.Enum(
    'immediate', 'hourly', 'daily', 'weekly',
    name='notification_frequency'
)

class UserNotificationPreferences(Base):
    __tablename__ = "user_notification_preferences"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    enabled: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text('true'))
    frequency: Mapped[str] = mapped_column(NotificationFrequencyEnum, nullable=False, server_default='immediate')
    types: Mapped[list] = mapped_column(JSONB, nullable=True, server_default=sa.text("'[]'::jsonb"))
    last_notified_at: Mapped[sa.DateTime] = mapped_column(sa.DateTime(timezone=True), nullable=True)
