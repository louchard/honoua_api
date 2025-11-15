from datetime import date
from typing import Optional, List, Literal

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    Request,
    Depends,
    status,
)
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.deps.db import get_db

# ---------- Router ----------
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
    """
    Création de groupe avec session SQLAlchemy synchrone.
    """
    try:
        result = db.execute(
            text(
                """
                INSERT INTO public.user_groups (owner_id, name)
                VALUES (:owner_id, :name)
                RETURNING id, owner_id, name, created_at
                """
            ),
            {"owner_id": payload.owner_id, "name": payload.name},
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=500, detail="Group creation failed")

        db.commit()

        return GroupOut(
            id=row["id"],
            name=row["name"],
            owner_id=row["owner_id"],
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
        )
    except Exception:
        db.rollback()
        raise


@router.get("/groups", response_model=List[GroupOut])
async def list_groups(
    owner_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Liste des groupes. DB en mode synchrone (pas de await sur db).
    """
    if owner_id:
        result = db.execute(
            text(
                """
                SELECT id, owner_id, name, created_at
                FROM public.user_groups
                WHERE owner_id = :owner_id
                ORDER BY created_at DESC, id DESC
                """
            ),
            {"owner_id": owner_id},
        )
    else:
        result = db.execute(
            text(
                """
                SELECT id, owner_id, name, created_at
                FROM public.user_groups
                ORDER BY created_at DESC, id DESC
                """
            )
        )

    rows = result.mappings().all()
    return [
        GroupOut(
            id=r["id"],
            name=r["name"],
            owner_id=r["owner_id"],
            created_at=r["created_at"].isoformat() if r["created_at"] else None,
        )
        for r in rows
    ]


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: int, db: Session = Depends(get_db)):
    """
    Suppression d'un groupe + ses sessions associées.
    """
    try:
        db.execute(
            text("DELETE FROM public.user_group_sessions WHERE group_id = :gid"),
            {"gid": group_id},
        )
        db.execute(
            text("DELETE FROM public.user_groups WHERE id = :gid"),
            {"gid": group_id},
        )
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception:
        db.rollback()
        raise


@router.post("/groups/{group_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def add_session_to_group(
    group_id: int,
    payload: GroupSessionAdd,
    db: Session = Depends(get_db),
):
    """
    Ajoute une session à un groupe (sans doublon).
    """
    try:
        db.execute(
            text(
                """
                INSERT INTO public.user_group_sessions (group_id, session_id)
                VALUES (:gid, :sid)
                ON CONFLICT DO NOTHING
                """
            ),
            {"gid": group_id, "sid": payload.session_id},
        )
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception:
        db.rollback()
        raise


@router.delete("/groups/{group_id}/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_session_from_group(
    group_id: int,
    session_id: str,
    db: Session = Depends(get_db),
):
    """
    Retire une session d'un groupe.
    """
    try:
        db.execute(
            text(
                """
                DELETE FROM public.user_group_sessions
                WHERE group_id = :gid AND session_id = :sid
                """
            ),
            {"gid": group_id, "sid": session_id},
        )
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception:
        db.rollback()
        raise


# ---------- A41 — Summary par groupes ----------

@router.get("/emissions/summary_groups")
async def get_emissions_summary_groups(
    request: Request,
    group_ids: List[int] = Query(..., description="IDs de groupes à comparer, ex: ?group_ids=1&group_ids=2"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    format: Optional[str] = Query(None, description='"json" or "csv"'),
    db: Session = Depends(get_db),
):
    """
    Summary d'émissions par groupe (A41).
    DB synchrone => pas de await sur db.execute.
    """
    # 1) Validation/normalisation des paramètres
    params = SummaryGroupsParams(
        group_ids=group_ids,
        start_date=date.fromisoformat(start_date) if start_date else None,
        end_date=date.fromisoformat(end_date) if end_date else None,
        format="json",
    )

    negotiated = (format or "").lower().strip() if format else None
    if negotiated not in {"json", "csv", None}:
        raise HTTPException(status_code=422, detail='format must be "json" or "csv"')
    if negotiated is None:
        negotiated = "csv" if "text/csv" in (request.headers.get("accept") or "").lower() else "json"

    # 2) Agrégation par groupe (une série par group_id)
    series = []
    for gid in params.group_ids:
        conditions = [
            "ec.session_id IN (SELECT ugs.session_id FROM public.user_group_sessions ugs WHERE ugs.group_id = :gid)"
        ]
        bind = {"gid": gid}

        if params.start_date:
            conditions.append("ec.created_at::date >= :start_date")
            bind["start_date"] = params.start_date
        if params.end_date:
            conditions.append("ec.created_at::date <= :end_date")
            bind["end_date"] = params.end_date

        where_sql = "WHERE " + " AND ".join(conditions)

        sql = f"""
            SELECT
                COALESCE(ec.category_code, '') AS category_code,
                AVG(ec.emissions_gco2e)::float8 AS avg_emission,
                MIN(ec.emissions_gco2e)::float8 AS min_emission,
                MAX(ec.emissions_gco2e)::float8 AS max_emission,
                SUM(ec.emissions_gco2e)::float8 AS total_emission
            FROM public.emission_calculations ec
            {where_sql}
            GROUP BY 1
            ORDER BY total_emission DESC NULLS LAST
        """

        rows = db.execute(text(sql), bind).mappings().all()
        series.append(
            {
                "group_id": gid,
                "items": [
                    {
                        "category_code": r["category_code"] or "",
                        "avg_emission": float(r["avg_emission"] or 0),
                        "min_emission": float(r["min_emission"] or 0),
                        "max_emission": float(r["max_emission"] or 0),
                        "total_emission": float(r["total_emission"] or 0),
                    }
                    for r in rows
                ],
            }
        )

    data = {
        "status": "A41 groups summary OK",
        "params": params.model_dump(),
        "series": series,
    }

    if negotiated == "json":
        return JSONResponse(content=jsonable_encoder(data))

    # CSV (groupé)
    import io
    import csv

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["group_id", "category_code", "avg_emission", "min_emission", "max_emission", "total_emission"])
    for s in series:
        for it in s["items"]:
            w.writerow(
                [
                    s["group_id"],
                    it["category_code"],
                    it["avg_emission"],
                    it["min_emission"],
                    it["max_emission"],
                    it["total_emission"],
                ]
            )
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")
