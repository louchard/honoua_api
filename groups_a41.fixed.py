from fastapi import APIRouter, HTTPException, Query, Request, Depends, status
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, field_validator
from typing import Optional, List, Literal
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.deps.db import get_db
from datetime import date
import io, csv

# Router tags=["groups"]
router = APIRouter(tags=["groups"])

# ---------- Schemas ----------
class GroupCreate(BaseModel):
    name: str
    owner_id: Optional[str] = None

class GroupOut(BaseModel):
    id: Optional[int] = None
    name: str
    owner_id: Optional[str] = None
    created_at: Optional[str] = None

class GroupSessionAdd(BaseModel):
    session_id: str

class SummaryGroupsParams(BaseModel):
    group_ids: List[int]
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Literal["json", "csv"] = "json"

    @field_validator("end_date")
    @classmethod
    def _check_range(cls, v, info):
        start = info.data.get("start_date")
        if start and v and start > v:
            raise ValueError("start_date must be <= end_date")
        return v

# ---------- Groups CRUD minimal ----------
@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            INSERT INTO public.user_groups (owner_id, name)
            VALUES (:owner_id, :name)
            RETURNING id, owner_id, name, created_at
        """),
        {"owner_id": payload.owner_id, "name": payload.name},
    ).mappings().first()
    db.commit()
    if not row:
        raise HTTPException(status_code=500, detail="Group creation failed")
    return GroupOut(
        id=row["id"],
        name=row["name"],
        owner_id=row["owner_id"],
        created_at=row["created_at"].isoformat() if row["created_at"] else None,
    )

@router.get("/groups", response_model=List[GroupOut])
async def list_groups(owner_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    if owner_id:
        rows = db.execute(
            text("""
                SELECT id, owner_id, name, created_at
                FROM public.user_groups
                WHERE owner_id = :owner_id
                ORDER BY created_at DESC, id DESC
            """),
            {"owner_id": owner_id},
        ).mappings().all()
    else:
        rows = db.execute(
            text("""
                SELECT id, owner_id, name, created_at
                FROM public.user_groups
                ORDER BY created_at DESC, id DESC
            """)
        ).mappings().all()
    return [
        GroupOut(
            id=r["id"],
            name=r["name"],
            owner_id=r["owner_id"],
            created_at=r["created_at"].isoformat() if r["created_at"] else None,
        ) for r in rows
    ]

@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: int, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM public.user_group_sessions WHERE group_id=:gid"), {"gid": group_id})
    db.execute(text("DELETE FROM public.user_groups WHERE id=:gid"), {"gid": group_id})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/groups/{group_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def add_session_to_group(group_id: int, payload: GroupSessionAdd, db: Session = Depends(get_db)):
    db.execute(
        text("""
            INSERT INTO public.user_group_sessions (group_id, session_id)
            VALUES (:gid, :sid)
            ON CONFLICT DO NOTHING
        """),
        {"gid": group_id, "sid": payload.session_id},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.delete("/groups/{group_id}/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_session_from_group(group_id: int, session_id: str, db: Session = Depends(get_db)):
    db.execute(
        text("DELETE FROM public.user_group_sessions WHERE group_id=:gid AND session_id=:sid"),
        {"gid": group_id, "sid": session_id},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# ---------- Squelette comparaison (pas d'agrégations encore) ----------
@router.get("/emissions/summary_groups")
async def get_emissions_summary_groups(
    request: Request,
    group_ids: List[int] = Query(..., description="IDs de groupes, ex: ?group_ids=1&group_ids=2"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    format: Optional[str] = Query(None, description='"json" or "csv"'),
):
    try:
        params = SummaryGroupsParams(
            group_ids=group_ids,
            start_date=date.fromisoformat(start_date) if start_date else None,
            end_date=date.fromisoformat(end_date) if end_date else None,
            format="json",
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    negotiated = (format or "").lower().strip() if format else None
    if negotiated not in {"json", "csv", None}:
        raise HTTPException(status_code=422, detail='format must be "json" or "csv"')
    if negotiated is None:
        accept = (request.headers.get("accept") or "").lower()
        negotiated = "csv" if "text/csv" in accept else "json"

    data = {
        "status": "A41 groups summary skeleton (no logic yet)",
        "params": params.model_dump(),
        "series": [],
    }
    if negotiated == "json":
        return JSONResponse(content=jsonable_encoder(data))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["group_id", "category_code", "avg_emission", "min_emission", "max_emission", "total_emission"])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")
