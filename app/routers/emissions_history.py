from __future__ import annotations
from fastapi import APIRouter, Depends, Request
# ---- PATCH A42: safe import for legacy db_conn ----
try:
    from app.db import db_conn  # legacy (peut ne pas exister en CI)
except Exception:               # ImportError ou autre
    db_conn = None
# ---- /PATCH ---------------------------------------from sqlalchemy import text
from fastapi.responses import StreamingResponse
import io, csv

from app.schemas.emissions_history import (
    HistoryQuery, HistoryResponse, HistorySummary, DataPoint, Interval, GroupBy
)
from contextlib import asynccontextmanager

try:
    # si un db_conn est déjà exposé (en dev), on l’utilise
    from app.db import db_conn  # type: ignore
except Exception:
    # sinon on crée un shim basé sur async_session (pour CI)
    from app.db.session import async_session
    @asynccontextmanager
    async def db_conn():
        async with async_session() as session:
            yield session

router = APIRouter(prefix="/emissions", tags=["emissions"])

@router.get("/ping_a37", summary="A37 ping (sanity)")
def ping_a37():
    return {"pong": "a37"}

@router.get("/db_ping_a37", summary="A37 DB ping (SELECT 1)")
def db_ping_a37():
    with db_conn() as conn:
        val = conn.execute(text("SELECT 1")).scalar_one()
    return {"db_ok": bool(val == 1)}

def _rows_to_models(rows):
    series = []
    sum_total = 0.0
    for r in rows:
        dp = DataPoint(
            t=r["t"],
            sum=float(r["sum"]) if r["sum"] is not None else None,
            avg=None,
            count=int(r["count"]) if r["count"] is not None else None,
            min=None,
            max=None,
            group=None,
        )
        series.append(dp)
        if r["sum"] is not None:
            sum_total += float(r["sum"])
    summary = HistorySummary(
        sum_total=sum_total,
        trend_slope_per_interval=0.0,  # calcul avancé ajouté plus tard
        count_points=len(series),
    )
    return series, summary

def _rows_to_csv(rows):
    headers = ["t", "sum", "avg", "count", "min", "max", "group"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        w.writerow([
            r.get("t"),
            r.get("sum"),
            None,
            r.get("count"),
            None,
            None,
            None,
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="emissions_history.csv"'}
    )

@router.get(
    "/history_a37",
    response_model=HistoryResponse,
    summary="Time-aggregated emissions (A37 JSON or CSV)"
)
def get_emissions_history_a37(request: Request, q: HistoryQuery = Depends()):
    # 1) Agrégat minimal (semaine)
    sql = """
        WITH base AS (
            SELECT
                DATE_TRUNC('week', created_at) AS t,
                SUM(emissions_gco2e) AS sum,
                COUNT(*) AS count
            FROM public.emission_calculations
            WHERE 1=1
            GROUP BY t
            ORDER BY t ASC
            LIMIT 366
        )
        SELECT * FROM base;
    """
    with db_conn() as conn:
        rows = conn.execute(text(sql)).mappings().all()

    # 2) Content negotiation
    accept = (request.headers.get("accept") or "").lower()
    if "text/csv" in accept:
        return _rows_to_csv(rows)

    # 3) JSON par défaut
    series, summary = _rows_to_models(rows)
    return HistoryResponse(
        interval=q.interval if q.interval else Interval.week,
        from_=q.from_,
        to=q.to,
        group_by=q.group_by if q.group_by else GroupBy.none,
        series=series,
        summary=summary,
        export_ready=True,
    )


# ---- PATCH A42: guard helper when db_conn is None ----
def _ensure_db_conn():
    if db_conn is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Database connection not available in this build")
# ---- /PATCH ------------------------------------------
