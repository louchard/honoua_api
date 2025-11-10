from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
import json
from sqlalchemy.sql import text
from app.db.session import async_session

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/preferences")
async def get_preferences(user_id: str, request: Request):
    sql = text("SELECT id, user_id, enabled, frequency, types, last_notified_at FROM user_notification_preferences WHERE user_id = CAST(:uid AS UUID) LIMIT 1")
    async with async_session() as session:
        res = await session.execute(sql, {"uid": user_id})
        row = res.first()
        if not row:
            return {"enabled": True, "frequency": "immediate", "types": [], "id": None, "user_id": user_id, "last_notified_at": None}
        id_, uid, enabled, frequency, types, last_notified_at = row
        return {"enabled": bool(enabled), "frequency": str(frequency), "types": (types or []), "id": id_, "user_id": str(uid), "last_notified_at": last_notified_at}

@router.put("/preferences")
async def put_preferences(user_id: str, payload: dict, request: Request):
    enabled = bool(payload.get("enabled", True))
    frequency = str(payload.get("frequency", "immediate"))
    types = payload.get("types", [])
    if not isinstance(types, list):
        raise HTTPException(status_code=400, detail="types must be a list")
    upsert = text("""INSERT INTO user_notification_preferences (user_id, enabled, frequency, types, last_notified_at)
VALUES (CAST(:uid AS UUID), :enabled, :frequency, CAST(:types AS JSONB), NULL)
ON CONFLICT (user_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    frequency = EXCLUDED.frequency,
    types = EXCLUDED.types
RETURNING id, user_id, enabled, frequency, types, last_notified_at
""")
    params = {"uid": user_id, "enabled": enabled, "frequency": frequency, "types": json.dumps(types)}
    async with async_session() as session:
        res = await session.execute(upsert, params)
        await session.commit()
        row = res.first()
        id_, uid, enabled, frequency, types, last_notified_at = row
        return {"enabled": bool(enabled), "frequency": str(frequency), "types": (types or []), "id": id_, "user_id": str(uid), "last_notified_at": last_notified_at}

@router.post("/test")
async def send_test(user_id: str):
    return {"sent": True, "to_user_id": user_id, "title": "Test", "body": "OK"}
