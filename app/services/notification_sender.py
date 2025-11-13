# app/services/notification_sender.py

import logging
from typing import Literal, Dict, Any

logger = logging.getLogger("honoua")


NotificationType = Literal["info", "alert", "success", "warning"]


def send_notification(
    user_id: int,
    message: str,
    notif_type: NotificationType = "info",
) -> Dict[str, Any]:
    """
    Service d'envoi de notification (mock local).

    Pour l’instant, on ne fait qu’écrire dans les logs.
    Cette fonction est pensée pour être safe et toujours
    renvoyer une structure simple, sans lever d’erreur.
    """
    logger.info(
        "[NOTIFICATION MOCK] user_id=%s type=%s message=%s",
        user_id,
        notif_type,
        message,
    )

    # Retourne un petit payload pour debug / tests
    return {
        "mock": True,
        "user_id": user_id,
        "type": notif_type,
        "message": message,
    }
