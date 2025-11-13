from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import declarative_mixin
from app.db import Base  # doit déjà exister dans ton projet

@declarative_mixin
class TimestampMixin:
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(64), nullable=False)

    instant_enabled = Column(Boolean, nullable=False, default=True)

    daily_enabled = Column(Boolean, nullable=False, default=False)
    daily_hour = Column(SmallInteger)  # 0..23 or NULL

    weekly_enabled = Column(Boolean, nullable=False, default=False)
    weekly_weekday = Column(SmallInteger)  # 0=Mon .. 6=Sun
    weekly_hour = Column(SmallInteger)     # 0..23

    quiet_start = Column(SmallInteger)  # 0..23
    quiet_end = Column(SmallInteger)    # 0..23

    timezone = Column(String(64), nullable=False, default="Europe/Paris")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_notification_preferences_user"),
    )
