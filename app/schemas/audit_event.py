from datetime import datetime
from pydantic import BaseModel

class AuditEventBase(BaseModel):
    event_type: str
    message: str

class AuditEventRead(AuditEventBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
