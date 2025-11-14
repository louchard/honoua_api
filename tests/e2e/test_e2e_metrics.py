from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_e2e_metrics_json():
    """
    Vérifie que l'endpoint /metrics renvoie bien un JSON valide
    avec les clés principales de télémétrie.
    """
    response = client.get("/metrics")

    # L'endpoint doit exister et répondre 200
    assert response.status_code == 200

    data = response.json()

    # Vérifications minimales sur la structure
    assert isinstance(data, dict)
    assert "total_requests" in data
    assert "total_errors" in data
    # Dans ton implémentation, c'est avg_duration_ms (pas total_duration_ms)
    assert "avg_duration_ms" in data

    # Vérifications optionnelles simples
    assert isinstance(data["total_requests"], int)
    assert isinstance(data["total_errors"], int)
    assert isinstance(data["avg_duration_ms"], (int, float))


def test_e2e_metrics_prometheus_format():
    """
    Vérifie que /metrics/prometheus répond au format texte Prometheus.
    """
    response = client.get("/metrics/prometheus")

    # L'endpoint doit exister
    assert response.status_code == 200

    # Prometheus = texte brut, pas JSON
    content = response.text
    assert isinstance(content, str)

    # Le contenu ne doit pas être vide
    assert len(content.strip()) > 0
