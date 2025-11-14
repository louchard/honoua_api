# app/middleware/telemetry.py

import time
import logging
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.telemetry.metrics import record_request

logger = logging.getLogger("honoua.telemetry")


def _get_client_ip(request: Request) -> Optional[str]:
    """
    Récupère l'adresse IP du client.

    Priorité :
    1) x-forwarded-for (première IP)
    2) request.client.host
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # x-forwarded-for: client, proxy1, proxy2...
        first_ip = xff.split(",")[0].strip()
        if first_ip:
            return first_ip

    client = request.client
    return client.host if client else None


class TelemetryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()

        client_ip = _get_client_ip(request)
        user_agent = request.headers.get("user-agent")
        request_id = request.headers.get("x-request-id")

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000.0

            logger.exception(
                "request_failed",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": 500,
                    "duration_ms": round(duration_ms, 3),
                    "client_ip": client_ip,
                    "user_agent": user_agent,
                    "request_id": request_id,
                    "db_duration_ms": None,  # placeholder pour la suite
                },
            )

            # Enregistrement métrique : requête en erreur
            record_request(duration_ms, is_error=True)

            raise

        duration_ms = (time.perf_counter() - start) * 1000.0

        logger.info(
            "request_completed",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 3),
                "client_ip": client_ip,
                "user_agent": user_agent,
                "request_id": request_id,
                "db_duration_ms": None,  # placeholder pour la suite
            },
        )

        # Enregistrement métrique : requête réussie
        record_request(duration_ms, is_error=False)

        return response
