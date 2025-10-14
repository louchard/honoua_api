from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_compare_returns_correct_structure():
    payload = {"eans": ["3017620422003", "3560071234567"]}
    r = client.post("/compare", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert len(data["results"]) == len(payload["eans"])

def test_compare_results_have_expected_keys():
    payload = {"eans": ["123", "456"]}
    r = client.post("/compare", json=payload)
    data = r.json()
    first_item = data["results"][0]
    assert {"ean", "carbon_kgCO2e"}.issubset(first_item.keys())
