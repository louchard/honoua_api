from httpx import AsyncClient
import pytest

@pytest.mark.asyncio
async def test_logs_recent_returns_list(app_client: AsyncClient):
    # Arrange: rien
    # Act
    resp = await app_client.get("/logs/recent?limit=3")
    # Assert
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if len(data):
        item = data[0]
        assert {"id","event_type","message","created_at"}.issubset(item.keys())
