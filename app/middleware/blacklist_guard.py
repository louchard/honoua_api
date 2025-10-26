from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
import os
import jwt

# Config
DATABASE_URL = os.getenv("HONOUA_DB_URL", "postgresql+psycopg://honou:Honou2025Lg!@postgres:5432/honoua")
JWT_SECRET = os.getenv("HONOUA_JWT_SECRET", "devsecret")
JWT_ALGO = os.getenv("HONOUA_JWT_ALGO", "HS256")

engine = create_engine(DATABASE_URL, future=True)

# Chemins exemptés (santé, docs, openapi, static)
EXEMPT = {
    "/health", "/docs", "/openapi.json", "/redoc"
}

def is_exempt(path: str) -> bool:
    if path in EXEMPT: 
        return True
    # ressources docs statiques
    if path.startswith("/docs") or path.startswith("/static"):
        return True
    return False

async def blacklist_guard(request: Request, call_next: Callable) -> Response:
    path = request.url.path
    if is_exempt(path):
        return await call_next(request)

    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        # Laisse la route décider si anonyme autorisé ; si tu veux forcer 401 partout, renvoie JSONResponse ici.
        return await call_next(request)

    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        jti = payload.get("jti")
    except Exception:
        # Token illisible → laisse la route gérer (ou renvoie 401 si tu préfères strict)
        return await call_next(request)

    if not jti:
        return await call_next(request)

    with engine.begin() as conn:
        hit = conn.execute(text("SELECT 1 FROM token_blacklist WHERE jti=:jti"), {"jti": jti}).first()
        if hit:
            return JSONResponse(status_code=401, content={"detail": "Token revoked"})

    return await call_next(request)
