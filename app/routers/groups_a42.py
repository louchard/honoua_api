from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.encoders import jsonable_encoder
from typing import Optional, List, Literal, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date
from app.deps.db import get_db

router = APIRouter(tags=["groups"])

Interval = Literal["week", "month"]

def _trend_slope_from_items(items: List[Dict[str, Any]]) -> float:
    """
    Pente de tendance (moindres carrés) sur (index, total_emission).
    Retourne 0.0 si < 2 points.
    """
    n = len(items)
    if n < 2:
        return 0.0
    # x = 0..n-1 ; y = total_emission
    sum_x = sum(range(n))
    ys = [float(it.get("total_emission") or 0.0) for it in items]
    sum_y = sum(ys)
    sum_xx = sum(i * i for i in range(n))
    sum_xy = sum(i * ys[i] for i in range(n))
    denom = (n * sum_xx - sum_x * sum_x)
    if denom == 0:
        return 0.0
    slope = (n * sum_xy - sum_x * sum_y) / denom
    return float(slope)

@router.get("/groups/compare")
async def compare_groups_evolution(
    request: Request,
    ids: List[int] = Query(..., description="IDs des groupes, ex: ?ids=1&ids=2"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    interval: Interval = Query("week", description="week | month"),
    format: Optional[str] = Query(None, description='"json" ou "csv"'),
    db: AsyncSession = Depends(get_db),
):
    # --- Validation basique ---
    if not ids:
        raise HTTPException(status_code=422, detail="ids is required")
    try:
        sd = date.fromisoformat(start_date) if start_date else None
        ed = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date/end_date must be YYYY-MM-DD")
    if sd and ed and sd > ed:
        raise HTTPException(status_code=422, detail="start_date must be <= end_date")

    negotiated = (format or "").lower().strip() if format else None
    if negotiated not in {"json", "csv", None}:
        raise HTTPException(status_code=422, detail='format must be "json" or "csv"')
    if negotiated is None:
        negotiated = "csv" if "text/csv" in (request.headers.get("accept") or "").lower() else "json"

    # --- Intervalle sécurisé ---
    if interval not in ("week", "month"):
        raise HTTPException(status_code=422, detail="interval must be 'week' or 'month'")
    bucket = "week" if interval == "week" else "month"

    # --- 1) Collecte temporaire par groupe (timeseries + totaux de période) ---
    tmp: List[Dict[str, Any]] = []
    for gid in ids:
        conditions = [
            "ec.session_id IN (SELECT ugs.session_id FROM public.user_group_sessions ugs WHERE ugs.group_id = :gid)"
        ]
        bind: Dict[str, Any] = {"gid": gid}
        if sd:
            conditions.append("ec.created_at::date >= :start_date")
            bind["start_date"] = sd
        if ed:
            conditions.append("ec.created_at::date <= :end_date")
            bind["end_date"] = ed
        where_sql = "WHERE " + " AND ".join(conditions)

        sql = f"""
            SELECT
                date_trunc('{bucket}', ec.created_at::date)::date AS bucket_start,
                SUM(ec.emissions_gco2e)::float8 AS total_emission,
                AVG(ec.emissions_gco2e)::float8 AS avg_emission
            FROM public.emission_calculations ec
            {where_sql}
            GROUP BY 1
            ORDER BY bucket_start ASC
        """
        rows = (await db.execute(text(sql), bind)).mappings().all()
        items = [
            {
                "bucket_start": r["bucket_start"].isoformat() if r["bucket_start"] else None,
                "total_emission": float(r["total_emission"] or 0),
                "avg_emission": float(r["avg_emission"] or 0),
            }
            for r in rows
        ]

        period_total = sum(it["total_emission"] for it in items) if items else 0.0
        period_avg = (sum(it["avg_emission"] for it in items) / len(items)) if items else 0.0
        trend_slope = _trend_slope_from_items(items)

        tmp.append({
            "group_id": gid,
            "interval": interval,
            "items": items,
            "period_total": float(period_total),
            "period_avg": float(period_avg),
            "trend_slope": float(trend_slope),
        })

    # --- 2) Classement low-CO2 (tri croissant par total sur la période) ---
    ordered = sorted(tmp, key=lambda x: x["period_total"])
    for rank, entry in enumerate(ordered, start=1):
        entry["low_co2_rank"] = rank

    # --- 2bis) Diff absolu/relatif vs meilleur total ---
    best_total = ordered[0]["period_total"] if ordered else 0.0
    comparison = []
    for e in ordered:
        diff_abs_total = float(e["period_total"] - best_total)
        diff_rel_total = float((diff_abs_total / best_total) * 100.0) if best_total > 0 else 0.0
        comparison.append({
            "group_id": e["group_id"],
            "low_co2_rank": e["low_co2_rank"],
            "period_total": e["period_total"],
            "period_avg": e["period_avg"],
            "trend_slope": e["trend_slope"],
            "diff_abs_total": diff_abs_total,
            "diff_rel_total": diff_rel_total,
        })

    # --- 3) Sortie finale (series) ---
    series = [
        {
            "group_id": e["group_id"],
            "interval": e["interval"],
            "low_co2_rank": e["low_co2_rank"],
            "trend_slope": e["trend_slope"],
            "items": e["items"],
        }
        for e in ordered
    ]

    data = {
        "status": "A42 compare OK (timeseries + low_co2_rank + diffs)",
        "params": {
            "ids": ids,
            "start_date": sd.isoformat() if sd else None,
            "end_date": ed.isoformat() if ed else None,
            "interval": interval,
            "format": negotiated,
        },
        "series": series,
        "comparison": comparison,
    }

    if negotiated == "json":
        return JSONResponse(content=jsonable_encoder(data))

    # CSV export
    import io, csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["group_id", "interval", "low_co2_rank", "bucket_start", "total_emission", "avg_emission"])
    for s in series:
        for it in s["items"]:
            w.writerow([
                s["group_id"],
                s["interval"],
                s["low_co2_rank"],
                it["bucket_start"],
                it["total_emission"],
                it["avg_emission"],
            ])
    # Résumé comparatif (période)
    w.writerow([])
    w.writerow(["group_id", "low_co2_rank", "period_total", "period_avg", "trend_slope", "diff_abs_total", "diff_rel_total(%)"])
    for row in comparison:
        w.writerow([
            row["group_id"],
            row["low_co2_rank"],
            row["period_total"],
            row["period_avg"],
            row["trend_slope"],
            row["diff_abs_total"],
            row["diff_rel_total"],
        ])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")