# app/telemetry/metrics.py

from typing import Dict, Optional
from threading import Lock

_lock = Lock()

# Registre de métriques en mémoire
_total_requests = 0
_total_errors = 0
_total_duration_ms = 0.0


def record_request(duration_ms: float, is_error: bool) -> None:
    """
    Enregistre une requête dans le registre de métriques.
    Thread-safe grâce au Lock.
    """
    global _total_requests, _total_errors, _total_duration_ms

    with _lock:
        _total_requests += 1
        _total_duration_ms += duration_ms
        if is_error:
            _total_errors += 1


def get_metrics_snapshot() -> Dict[str, Optional[float]]:
    """
    Retourne un petit snapshot des métriques en JSON (pour /metrics).
    """
    with _lock:
        if _total_requests > 0:
            avg_duration = _total_duration_ms / _total_requests
        else:
            avg_duration = None

        return {
            "total_requests": _total_requests,
            "total_errors": _total_errors,
            "avg_duration_ms": avg_duration,
        }


# ---------------------------------------------------------------------------
#  A43.5 — Export Prometheus
# ---------------------------------------------------------------------------
def get_prometheus_metrics() -> str:
    """
    Retourne les métriques au format texte Prometheus (exposition format).
    """

    with _lock:
        total_requests = _total_requests
        total_errors = _total_errors
        avg_duration = (
            _total_duration_ms / _total_requests if _total_requests > 0 else 0.0
        )

    # Format Prometheus standard (type, help, métriques)
    lines = [
        "# HELP honoua_total_requests Total number of HTTP requests.",
        "# TYPE honoua_total_requests counter",
        f"honoua_total_requests {total_requests}",
        "",
        "# HELP honoua_total_errors Total number of failed HTTP requests (status >= 500).",
        "# TYPE honoua_total_errors counter",
        f"honoua_total_errors {total_errors}",
        "",
        "# HELP honoua_average_response_time_ms Average response time in milliseconds.",
        "# TYPE honoua_average_response_time_ms gauge",
        f"honoua_average_response_time_ms {avg_duration}",
        "",
    ]

    return "\n".join(lines)
