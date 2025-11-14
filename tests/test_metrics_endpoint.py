# tests/test_metrics_endpoint.py

from starlette.testclient import TestClient
from app.main import app


def test_metrics_endpoint_basic_structure():
    client = TestClient(app)

    r = client.get("/metrics")
    assert r.status_code == 200

    data = r.json()

    assert "total_requests" in data
    assert "total_errors" in data
    assert "avg_duration_ms" in data


def test_metrics_increment_after_requests():
    client = TestClient(app)

    # snapshot initial
    before = client.get("/metrics").json()
    before_total = before["total_requests"]

    # on fait une requête simple
    resp = client.get("/metrics")
    assert resp.status_code == 200

    # snapshot après
    after = client.get("/metrics").json()
    after_total = after["total_requests"]

    # on doit avoir au minimum +1
    assert after_total >= before_total + 1
