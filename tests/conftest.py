# tests/conftest.py
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest_asyncio.fixture
async def app_client() -> AsyncClient:
    """
    Client HTTP asynchrone branché directement sur l'app FastAPI (sans réseau).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
