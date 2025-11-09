from typing import Optional, Tuple
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.security.jwt_utils import encode_jwt, decode_jwt, now_utc
from app.deps.db import get_db
from app.deps.audit import audit_from_request_sync


# --- Modèles & helpers d'auth minimalistes pour éviter les NameError ---

class LoginIn(BaseModel):
    username: str
    password: str


def authenticate(username: str, password: str):
    """
    Stub d'auth: accepte tout couple non vide.
    Remplace par ta vraie logique plus tard.
    """
    if not username or not password:
        return None
    return {"id": username}


def issue_tokens(user) -> Tuple[str, str]:
    """
    Stub d’émission: génère 2 JWT (access + refresh) avec encode_jwt.
    Ajuste les claims/TTL selon tes besoins ensuite.
    """
    access_token, _, _ = encode_jwt(sub=str(user["id"]))
    refresh_token, _, _ = encode_jwt(sub=str(user["id"]))
    return access_token, refresh_token


# --- Router ---

router = APIRouter(prefix="/tokens", tags=["tokens"])

DATABASE_URL = os.getenv(
    "HONOUA_DB_URL",
    "postgresql+psycopg://honou:Honou2025Lg!@postgres:5432/honoua",
)
engine = create_engine(DATABASE_URL, future=True)


class RotateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    jti: str
    rotated_from: Optional[str] = None
    revoked_old: bool = True
    expires_in: int


def _extract_bearer(auth_header: Optional[str]) -> str:
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return auth_header.split(" ", 1)[1].strip()


def _client_meta(req: Request):
    ip = req.headers.get("x-forwarded-for") or (req.client.host if req.client else None)
    ua = req.headers.get("user-agent")
    return ip, ua


@router.post(
    "/rotate",
    response_model=RotateResponse,
    status_code=status.HTTP_200_OK,
    operation_id="tokens_rotate",
)
def rotate_token(request: Request, authorization: Optional[str] = Header(None)):
    # 1) Lire et décoder le token courant
    token = _extract_bearer(authorization)
    try:
        payload = decode_jwt(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    sub = str(payload.get("sub") or "unknown")
    old_jti = str(payload.get("jti") or "")
    if not old_jti:
        raise HTTPException(status_code=401, detail="Token missing jti")

    # 2) Vérifier blacklist + ledger et générer le nouveau token
    with engine.begin() as conn:
        is_revoked = conn.execute(
            text("SELECT 1 FROM token_blacklist WHERE jti=:jti"), {"jti": old_jti}
        ).first()
        if is_revoked:
            raise HTTPException(status_code=401, detail="Token revoked")

        new_token, new_jti, new_exp = encode_jwt(sub=sub)

        conn.execute(
            text(
                "INSERT INTO token_blacklist (jti, reason) "
                "VALUES (:jti, :reason) ON CONFLICT (jti) DO NOTHING"
            ),
            {"jti": old_jti, "reason": "rotated"},
        )

        ip, ua = _client_meta(request)
        conn.execute(
            text(
                """
            UPDATE token_ledger
               SET revoked_at = NOW(),
                   revoked_reason = 'rotated',
                   replaced_by_jti = :new_jti
             WHERE jti = :old_jti
            """
            ),
            {"old_jti": old_jti, "new_jti": new_jti},
        )
        conn.execute(
            text(
                """
            INSERT INTO token_ledger (user_id, jti, issued_at, expires_at, replaced_by_jti, ip, user_agent)
            VALUES (:user_id, :jti, NOW(), :exp, NULL, :ip, :ua)
            """
            ),
            {"user_id": sub, "jti": new_jti, "exp": new_exp, "ip": ip, "ua": ua},
        )

    ttl = int((new_exp - now_utc()).total_seconds())
    return RotateResponse(
        access_token=new_token,
        jti=new_jti,
        rotated_from=old_jti,
        revoked_old=True,
        expires_in=max(ttl, 0),
    )


@router.post("/login")
async def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    # 1) Authentification
    user = authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 2) Émission des tokens
    access_token, refresh_token = issue_tokens(user)

    # 3) Audit de la connexion réussie
    audit_from_request_sync(request, db, "auth.login", "connexion réussie")

    # 4) Réponse
    return {"access_token": access_token, "refresh_token": refresh_token}
