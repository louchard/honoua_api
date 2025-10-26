import os, uuid
from datetime import datetime, timedelta, timezone
import jwt

ALGO = os.getenv("HONOUA_JWT_ALGO", "HS256")
SECRET = os.getenv("HONOUA_JWT_SECRET", "devsecret")  # ⚠️ à surcharger en prod via env
EXPIRES = int(os.getenv("HONOUA_JWT_EXPIRES", "3600"))

def now_utc():
    return datetime.now(timezone.utc)

def new_jti() -> str:
    return uuid.uuid4().hex

def encode_jwt(sub: str, extra: dict | None = None, expires_in: int | None = None):
    jti = new_jti()
    exp_s = EXPIRES if expires_in is None else expires_in
    exp = now_utc() + timedelta(seconds=exp_s)
    payload = {"sub": sub, "jti": jti, "exp": exp}
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, SECRET, algorithm=ALGO)
    return token, jti, exp

def decode_jwt(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=[ALGO])
