# app/db/session.py
import os
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine, async_sessionmaker
from typing import AsyncGenerator

# URL de connexion lue depuis l'env (définie dans docker-compose.override.yml)
DATABASE_URL = os.getenv("HONOUA_DB_URL")

# Moteur asynchrone (SQLAlchemy 2.x + psycopg v3)
engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

# Fabrique de sessions async
async_session: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# D?pendance FastAPI: fournit une session SQLAlchemy async par requ?te
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
