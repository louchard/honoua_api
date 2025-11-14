# app/logging_config.py

import json
import logging
import logging.config
from datetime import datetime, timezone
from typing import Any, Dict


# Liste de clés "standard" du LogRecord à ne pas dupliquer
_STANDARD_RECORD_KEYS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
}


class JSONLogFormatter(logging.Formatter):
    """
    Formatter qui produit une ligne JSON par log.
    Il fusionne les champs standards (timestamp, niveau...)
    avec les champs fournis via extra={...}.
    """

    def format(self, record: logging.LogRecord) -> str:
        # Base du log
        log: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Ajout des champs extra (comme path, method, status_code, duration_ms...)
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_KEYS:
                continue
            if key.startswith("_"):
                continue
            # On évite de réécraser déjà défini
            if key in log:
                continue
            log[key] = value

        return json.dumps(log, ensure_ascii=False)


def configure_logging() -> None:
    """
    Configure le logging global de l'application pour utiliser le formatter JSON.
    """
    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": "app.logging_config.JSONLogFormatter",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            }
        },
        "loggers": {
            # Logger racine de l'app
            "honoua": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
            # Sous-logger de télémétrie
            "honoua.telemetry": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
        },
        # Option : root logger en JSON aussi
        "root": {
            "handlers": ["console"],
            "level": "INFO",
        },
    }

    logging.config.dictConfig(config)
