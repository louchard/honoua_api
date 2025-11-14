# tests/test_telemetry.py

from fastapi import FastAPI
from starlette.testclient import TestClient

from app.middleware.telemetry import TelemetryMiddleware, logger as telemetry_logger


def create_test_app() -> FastAPI:
    """
    Petite app FastAPI dédiée au test du middleware de télémétrie.
    Elle ne dépend pas de app.main ni des routes Honoua.
    """
    app = FastAPI()

    @app.get("/ping")
    async def ping():
        return {"status": "ok"}

    app.add_middleware(TelemetryMiddleware)
    return app


def test_telemetry_middleware_logs_basic_fields(monkeypatch):
    # On capture ce que le logger reçoit
    recorded = {}

    def fake_info(msg, *args, **kwargs):
        recorded["msg"] = msg
        recorded["kwargs"] = kwargs

    # On remplace logger.info du module de télémétrie
    monkeypatch.setattr(telemetry_logger, "info", fake_info)

    app = create_test_app()
    client = TestClient(app)

    headers = {
        "User-Agent": "test-client",
        "X-Request-ID": "req-123",
        # on pourrait aussi tester x-forwarded-for ici si besoin
        "X-Forwarded-For": "203.0.113.10",
    }

    # On appelle l’endpoint de test
    response = client.get("/ping", headers=headers)
    assert response.status_code == 200, response.text

    # Vérification que le logger a bien été appelé avec les bons champs
    assert "kwargs" in recorded
    extra = recorded["kwargs"].get("extra")
    assert extra is not None

    # Champs de base
    assert extra["path"] == "/ping"
    assert extra["method"] == "GET"
    assert extra["status_code"] == 200
    assert extra["duration_ms"] >= 0.0

    # Champs enrichis A43.3
    assert "client_ip" in extra
    assert extra["client_ip"] is not None  # doit être rempli (x-forwarded-for ou client.host)

    assert extra["user_agent"] == "test-client"
    assert extra["request_id"] == "req-123"

    # Placeholder DB
    assert "db_duration_ms" in extra
    # pour l’instant on accepte None
    assert extra["db_duration_ms"] is None
