from sqlalchemy import Column, Integer, String, DateTime, text
from sqlalchemy.orm import declarative_base

# Définition locale de Base (pas de app.db.base_class dans ce projet)
Base = declarative_base()


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(64), index=True, nullable=False)
    message = Column(String(512), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )
