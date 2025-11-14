from starlette.testclient import TestClient
from app.main import app


def test_prometheus_metrics_endpoint():
    client = TestClient(app)

    # Appel endpoint
    r = client.get("/metrics/prometheus")

    # Code OK
    assert r.status_code == 200

    # Format texte
    assert r.headers["content-type"].startswith("text/plain")

    body = r.text

    # Vérification des métriques
    assert "honoua_total_requests" in body
    assert "honoua_total_errors" in body
    assert "honoua_average_response_time_ms" in body
