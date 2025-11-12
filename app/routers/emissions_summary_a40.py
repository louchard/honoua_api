from fastapi.encoders import jsonable_encoder
from fastapi import APIRouter, Query, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import Optional, Literal, List
from pydantic import BaseModel, field_validator
from datetime import date
import io
import csv

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.deps.db import get_db

router = APIRouter(prefix="/emissions", tags=["emissions"])


class SummaryParams(BaseModel):
    category_code: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Literal["json", "csv"] = "json"

        # Tri/pagination (valeurs par défaut sûres)
    sort_by: Literal["total_emission","avg_emission","min_emission","max_emission"] = "total_emission"
    order:   Literal["desc","asc"] = "desc"
    limit:   int = 100
    offset:  int = 0


    @field_validator("end_date")
    @classmethod
    def _check_range(cls, v, info):
        data = info.data
        start = data.get("start_date")
        if start and v and start > v:
            raise ValueError("start_date must be <= end_date")
        return v


class SummaryItem(BaseModel):
    category_code: str
    subcategory_code: Optional[str] = None
    avg_emission: float
    min_emission: float
    max_emission: float
    total_emission: float


@router.get("/summary_a40")
async def get_emissions_summary_a40(
    request: Request,
    category_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    format: Optional[str] = Query(None, description='"json" or "csv"'),
    sort_by: Optional[str] = Query(None, description="total_emission|avg_emission|min_emission|max_emission"),
    order:   Optional[str] = Query(None, description="desc|asc"),
    limit:   Optional[int] = Query(None, ge=1, le=1000),
    offset:  Optional[int] = Query(None, ge=0),

    db: Session = Depends(get_db),
):
    # 1) Parsing/validation
    try:
        payload = SummaryParams(
            category_code=category_code,
            start_date=date.fromisoformat(start_date) if start_date else None,
            end_date=date.fromisoformat(end_date) if end_date else None,
            format="json",  # valeur par défaut; la négociation décide ensuite
            sort_by=(sort_by or "total_emission"),
            order=(order or "desc"),
            limit=(limit or 100),
            offset=(offset or 0),
        )


    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # 2) Négociation de contenu
    negotiated = (format or "").lower().strip() if format else None
    if negotiated not in {"json", "csv", None}:
        raise HTTPException(status_code=422, detail='format must be "json" or "csv"')
    if negotiated is None:
        accept = (request.headers.get("accept") or "").lower()
        negotiated = "csv" if "text/csv" in accept else "json"

    # 3) Agrégation DB (squelette) + fallback
    summary: List[SummaryItem] = []
    note: Optional[str] = None

    try:
        # Hypothèses de colonnes à confirmer à l'étape suivante :
        #  - Table: emissions_history
        #  - Colonnes: category_code, subcategory_code, emission_kgco2e, event_date
               # === A40: Agrégation basée sur public.emission_calculations ===
        # Filtres : category_code (égalité), start_date/end_date (sur created_at en UTC)
        conditions = []
        params = {}

        if payload.category_code:
            conditions.append("ec.category_code = :category_code")
            params["category_code"] = payload.category_code

        if payload.start_date:
            conditions.append("ec.created_at >= :start_date::timestamptz")
            params["start_date"] = payload.start_date

        if payload.end_date:
            # + 1 jour pour inclure la fin de journée
            conditions.append("ec.created_at < (:end_date::date + INTERVAL '1 day')")
            params["end_date"] = payload.end_date

        where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        sql = f"""
        SELECT
            COALESCE(ec.category_code, '')                          AS category_code,
            NULL::text                                              AS subcategory_code,
            AVG(ec.emissions_gco2e)::float8                         AS avg_emission,
            MIN(ec.emissions_gco2e)::float8                         AS min_emission,
            MAX(ec.emissions_gco2e)::float8                         AS max_emission,
            SUM(ec.emissions_gco2e)::float8                         AS total_emission
        FROM public.emission_calculations AS ec
        {where_sql}
        GROUP BY 1
        ORDER BY {col} {dir_sql} NULLS LAST
        LIMIT :_limit OFFSET :_offset
        """

        params["_limit"] = int(payload.limit)
        params["_offset"] = int(payload.offset)



        rows = db.execute(text(sql), params).mappings().all()
        summary = [
            SummaryItem(
                category_code=r["category_code"] or "",
                subcategory_code=(r.get("subcategory_code") or None),
                avg_emission=float(r["avg_emission"] or 0),
                min_emission=float(r["min_emission"] or 0),
                max_emission=float(r["max_emission"] or 0),
                total_emission=float(r["total_emission"] or 0),
            )
            for r in rows
        ]
    except Exception:
        # Fallback silencieux : on garde un summary vide et on indique une note
        summary = []
        note = "Aggregation skipped (DB schema to confirm)."

    # 4) Construction de la réponse
    data = {
        "status": "A40 summary endpoint skeleton ready",
        "params": payload.model_dump(),
        "negotiated_format": negotiated,
        "summary": [s.model_dump() for s in summary],
    }
    if note:
        data["note"] = note

    if negotiated == "json":
        return JSONResponse(content=jsonable_encoder(data))


    # CSV : en-tête + éventuelles lignes (si agrégations OK)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["category_code", "subcategory_code", "avg_emission", "min_emission", "max_emission", "total_emission"])
    for s in summary:
        writer.writerow([
            s.category_code,
            s.subcategory_code or "",
            s.avg_emission,
            s.min_emission,
            s.max_emission,
            s.total_emission,
        ])
    csv_text = buf.getvalue()
    headers = {"Content-Disposition": 'inline; filename="emissions_summary_a40.csv"'}
    return PlainTextResponse(csv_text, media_type="text/csv", headers=headers)
