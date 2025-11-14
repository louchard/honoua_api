from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_e2e_smoke_openapi():
    """
    Test E2E basique : vérifier que l'API démarre
    et que la spec OpenAPI est accessible.
    Cela prouve que:
      - l'application se charge sans erreur,
      - les routes sont bien montées.
    """
    response = client.get("/openapi.json")

    # L'API doit répondre
    assert response.status_code == 200

    data = response.json()

    # La spec OpenAPI doit contenir au moins la clé "paths"
    assert "paths" in data
    assert isinstance(data["paths"], dict)
