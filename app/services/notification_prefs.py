from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.notification_prefs import NotificationPreference
from app.schemas.notification_prefs import NotificationPrefsCreate, NotificationPrefsUpdate

def get_by_user_id(db: Session, user_id: str) -> NotificationPreference | None:
    return db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()

def create_or_get(db: Session, data: NotificationPrefsCreate) -> NotificationPreference:
    obj = get_by_user_id(db, data.user_id)
    if obj:
        return obj
    obj = NotificationPreference(
        user_id=data.user_id,
        instant_enabled=data.instant_enabled,
        daily_enabled=data.daily_enabled, daily_hour=data.daily_hour,
        weekly_enabled=data.weekly_enabled, weekly_weekday=data.weekly_weekday, weekly_hour=data.weekly_hour,
        quiet_start=data.quiet_start, quiet_end=data.quiet_end,
        timezone=data.timezone,
    )
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        obj = get_by_user_id(db, data.user_id)  # en cas de race condition
        if obj is None:
            raise
    db.refresh(obj)
    return obj

def update(db: Session, user_id: str, data: NotificationPrefsUpdate) -> NotificationPreference:
    obj = get_by_user_id(db, user_id)
    if not obj:
        # si pas trouvé, on crée avec defaults + update fourni
        base = NotificationPrefsCreate(user_id=user_id, **data.model_dump())
        return create_or_get(db, base)

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj
