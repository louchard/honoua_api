# tests/test_notifications.py
import pytest
from httpx import AsyncClient

FAKE_USER_ID_STR = "00000000-0000-0000-0000-000000000001"


# -----------------------------
# 1) GET /notifications/preferences
# -----------------------------
@pytest.mark.asyncio
async def test_get_preferences_creates_by_default(app_client: AsyncClient):
    resp = await app_client.get(
        f"/notifications/preferences?user_id={FAKE_USER_ID_STR}"
    )
    assert resp.status_code == 200
    data = resp.json()

    # On vérifie l'identité
    assert data["user_id"] == FAKE_USER_ID_STR

    # On vérifie la présence et le type des champs principaux
    assert isinstance(data["enabled"], bool)
    assert isinstance(data["allow_email"], bool)
    assert isinstance(data["allow_push"], bool)
    assert isinstance(data["allow_sms"], bool)

    assert data["frequency"] in ["immediate", "hourly", "daily", "weekly"]

    # Champs optionnels
    assert "types" in data
    assert isinstance(data["types"], list)

    assert "last_notified_at" in data  # peut être None
    assert "id" in data
    assert "updated_at" in data


# -----------------------------
# 2) POST /notifications/preferences
# -----------------------------

@pytest.mark.asyncio
async def test_post_preferences_overwrites_all(app_client: AsyncClient):
    body = {
        "user_id": FAKE_USER_ID_STR,   # ✅ on l’ajoute ici
        "enabled": False,
        "allow_email": False,
        "allow_push": True,
        "allow_sms": True,
        "frequency": "daily",
        "types": ["alert", "info"],
        "last_notified_at": None,
    }

    resp = await app_client.post(
        f"/notifications/preferences?user_id={FAKE_USER_ID_STR}",
        json=body,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["user_id"] == FAKE_USER_ID_STR
    assert data["enabled"] is False
    assert data["allow_email"] is False
    assert data["allow_push"] is True
    assert data["allow_sms"] is True
    assert data["frequency"] == "daily"
    assert data["types"] == ["alert", "info"]


# -----------------------------
# 3) PATCH /notifications/preferences
# -----------------------------
@pytest.mark.asyncio
async def test_patch_preferences_partial_update(app_client: AsyncClient):
    body = {
        "allow_email": True,
        "allow_sms": False,
    }

    resp = await app_client.patch("/notifications/preferences", json=body)
    assert resp.status_code == 200
    data = resp.json()

    assert data["allow_email"] is True
    assert data["allow_sms"] is False


# -----------------------------
# 4) POST /notifications/send
# -----------------------------
@pytest.mark.asyncio
async def test_send_notification_mock(app_client: AsyncClient):
    # 1) On réactive les notifications pour l'utilisateur FAKE_USER_ID
    patch_body = {
        "enabled": True,
        "allow_email": True,
        "allow_push": True,
        "allow_sms": False,
    }

    resp_prefs = await app_client.patch("/notifications/preferences", json=patch_body)
    assert resp_prefs.status_code == 200

    # 2) On envoie une notification mock
    body = {
        "message": "Test notification",
        "type": "info",
    }

    resp = await app_client.post("/notifications/send", json=body)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "sent"
    assert data["message"] == "Test notification"
    assert data["type"] == "info"
    assert data["user_id"] == FAKE_USER_ID_STR
    assert "service_result" in data
    assert data["service_result"]["mock"] is True
