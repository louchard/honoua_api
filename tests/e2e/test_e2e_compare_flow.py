from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_e2e_compare_endpoint_exists_and_handles_bad_payload():
    """
    Test E2E simple sur l'endpoint de comparaison.

    Objectif :
    - Vérifier que /api/compare existe bien.
    - Vérifier qu'il ne renvoie pas une erreur serveur (5xx)
      quand on lui envoie un payload invalide.
    - Accepter un code 400 ou 422 (erreur de validation),
      ce qui est normal si le body ne respecte pas le schéma.
    """
    # Payload volontairement invalide / incomplet
    payload = {"foo": "bar"}

    response = client.post("/api/compare", json=payload)

    # On accepte 400 ou 422 (erreur côté client) comme comportement normal
    assert response.status_code in (400, 422), response.text

    # Optionnel : on vérifie que ce n'est PAS une erreur 5xx
    assert not (500 <= response.status_code < 600)
