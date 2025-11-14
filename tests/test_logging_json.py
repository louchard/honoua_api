# tests/test_logging_json.py

import json
import logging
from io import StringIO

from app.logging_config import JSONLogFormatter


def test_json_log_formatter_produces_valid_json():
    logger = logging.getLogger("honoua.telemetry")

    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JSONLogFormatter())

    # On isole ce handler pour le test
    logger.handlers = []
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    logger.info(
        "request_completed",
        extra={
            "path": "/ping",
            "method": "GET",
            "status_code": 200,
            "duration_ms": 12.3,
        },
    )

    # Récupération de la ligne produite
    log_line = stream.getvalue().strip()
    assert log_line, "Aucune ligne n'a été loggée"

    data = json.loads(log_line)

    # Champs de base
    assert data["message"] == "request_completed"
    assert data["level"] == "INFO"
    assert data["logger"] == "honoua.telemetry"

    # Champs extra
    assert data["path"] == "/ping"
    assert data["method"] == "GET"
    assert data["status_code"] == 200
    assert data["duration_ms"] == 12.3

    # Timestamp présent
    assert "timestamp" in data
