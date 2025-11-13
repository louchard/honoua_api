from typing import Optional, Literal
from pydantic import BaseModel, Field, conint

Hour = conint(ge=0, le=23)
Weekday = conint(ge=0, le=6)  # 0=lundi, 6=dimanche

class NotificationPrefsBase(BaseModel):
    instant_enabled: bool = True

    daily_enabled: bool = False
    daily_hour: Optional[Hour] = None

    weekly_enabled: bool = False
    weekly_weekday: Optional[Weekday] = None
    weekly_hour: Optional[Hour] = None

    quiet_start: Optional[Hour] = None
    quiet_end: Optional[Hour] = None

    timezone: str = "Europe/Paris"

class NotificationPrefsCreate(NotificationPrefsBase):
    user_id: str = Field(..., min_length=1, max_length=64)

class NotificationPrefsUpdate(NotificationPrefsBase):
    pass

class NotificationPrefsRead(NotificationPrefsBase):
    id: int
    user_id: str

    class Config:
        from_attributes = True
