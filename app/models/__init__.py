#app models __init__.py
# Import all model modules so SQLAlchemy Base.metadata is populated

from app.models.notification_preferences import NotificationPreferences  # noqa: F401
from app.models.user_notification_preferences import UserNotificationPreferences  # noqa: F401

