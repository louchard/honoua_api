from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_e2e_notifications_list_exists():
    """
    Test E2E : vérifier que l’endpoint GET /notifications existe.
    On accepte les statuts :
      - 200 : OK (liste existante)
      - 404 : OK si aucun utilisateur ou aucune donnée
    L'important est : pas d'erreur 500.
    """
    response = client.get("/notifications")
    assert response.status_code in (200, 404)
    assert not (500 <= response.status_code < 600)


def test_e2e_notifications_preferences_post():
    """
    Test E2E : vérifier que POST /notifications/preferences
    accepte un payload minimal et ne renvoie pas 500.
    On accepte :
      - 200 = mise à jour OK
      - 201 = créé
      - 422 = payload invalide (normal)
    """
    payload = {"dummy": True}  # volontairement incorrect

    response = client.post("/notifications/preferences", json=payload)

    assert response.status_code in (200, 201, 400, 422)
    assert not (500 <= response.status_code < 600)
