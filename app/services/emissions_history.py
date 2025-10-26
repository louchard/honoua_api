from typing import Dict, Tuple, List
from app.schemas.emissions_history import HistoryQuery, Metric, GroupBy

TABLE = "public.emission_calculations"
TS_COL = "created_at"
VAL_COL = "emissions_gco2e"

_ALLOWED_INTERVALS = {"day", "week", "month"}

def _bucket_sql(interval: str) -> str:
    if interval not in _ALLOWED_INTERVALS:
        raise ValueError(f"interval not allowed: {interval}")
    # Postgres: created_at est déjà en timestamptz -> pas de AT TIME ZONE
    return f"DATE_TRUNC('{interval}', {TS_COL})"

def _metric_select(metrics: List[Metric]) -> List[str]:
    sels = []
    for m in metrics or []:
        if m == Metric.sum:
            sels.append(f"SUM({VAL_COL}) AS sum")
        elif m == Metric.avg:
            sels.append(f"AVG({VAL_COL}) AS avg")
        elif m == Metric.count:
            sels.append("COUNT(*) AS count")
        elif m == Metric.min:
            sels.append(f"MIN({VAL_COL}) AS min")
        elif m == Metric.max:
            sels.append(f"MAX({VAL_COL}) AS max")
    return sels or ["SUM(emissions_gco2e) AS sum", "COUNT(*) AS count"]

def _groupby_col(group_by: GroupBy) -> str:
    if group_by == GroupBy.none:
        return ""
    mapping = {
        GroupBy.category: "category_code",
        GroupBy.product: "product_id",
        GroupBy.store: "NULL::text",
        GroupBy.brand: "NULL::text",
    }
    return mapping.get(group_by, "")

def build_history_sql(q: HistoryQuery) -> Tuple[str, Dict]:
    metrics = q.metrics or [Metric.sum, Metric.count]
    interval = q.interval.value
    bucket = _bucket_sql(interval)
    metric_sel = _metric_select(metrics)

    group_col = _groupby_col(q.group_by)
    sel_group = f", {group_col} AS group" if group_col else ""
    grp_group = f", {group_col}" if group_col else ""

    where_parts = ["1=1"]
    params: Dict = {}
    if q.from_ is not None:
        where_parts.append(f"{TS_COL} >= :from_ts")
        params["from_ts"] = q.from_
    if q.to is not None:
        where_parts.append(f"{TS_COL} <= :to_ts")
        params["to_ts"] = q.to

    limit = max(1, int(q.limit or 366))

    sql = f"""
    WITH base AS (
      SELECT
        {bucket} AS t
        {sel_group if sel_group else ""}
        , {", ".join(metric_sel)}
      FROM {TABLE}
      WHERE {' AND '.join(where_parts)}
      GROUP BY t{grp_group}
      ORDER BY t ASC
      LIMIT {limit}
    )
    SELECT * FROM base;
    """.strip()
    return sql, params

def compute_trend_slope(rows) -> float:
    xs, ys = [], []
    for i, r in enumerate(rows):
        y = r.get("sum") if r.get("sum") is not None else r.get("avg") or 0.0
        xs.append(float(i)); ys.append(float(y))
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs)/n; my = sum(ys)/n
    num = sum((x-mx)*(y-my) for x, y in zip(xs, ys))
    den = sum((x-mx)**2 for x in xs)
    return 0.0 if den == 0 else num/den
