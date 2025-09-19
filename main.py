from fastapi import FastAPI, HTTPException, Query
from typing import Optional, Any, List
import os
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv()

DB_DSN = (
    f"host={os.getenv('PGHOST','localhost')} "
    f"port={os.getenv('PGPORT','5432')} "
    f"dbname={os.getenv('PGDATABASE','honoua')} "
    f"user={os.getenv('PGUSER','honou')} "
    f"password={os.getenv('PGPASSWORD','')}"
)

app = FastAPI(title="Honoua API", version="0.1.0")
conn = None

@app.on_event("startup")
def startup():
    global conn
    conn = psycopg.connect(DB_DSN, row_factory=dict_row)
    conn.autocommit = True

@app.on_event("shutdown")
def shutdown():
    if conn:
        conn.close()

@app.get("/health")
def health():
    with conn.cursor() as cur:
        cur.execute("SELECT 1 AS ok;")
        return cur.fetchone()

@app.get("/products/{ean}")
def get_product_by_ean(ean: str):
    sql = "SELECT * FROM honou.products WHERE ean13_clean = %s LIMIT 1;"
    with conn.cursor() as cur:
        cur.execute(sql, (ean,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="EAN not found")
        return row

@app.get("/products")
def list_products(
    brand: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = Query(None, description="Recherche texte sur product_name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    clauses: List[str] = []
    params: List[Any] = []
    if brand:
        clauses.append("brand = %s")
        params.append(brand)
    if category:
        clauses.append("category = %s")
        params.append(category)
    if q:
        clauses.append("product_name ILIKE %s")
        params.append(f"%{q}%")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT id, ean13_clean, product_name, brand, category,
               carbon_product_kgco2e, carbon_pack_kgco2e, net_weight_kg,
               origin_country, origin_lat, origin_lon, zone_geo, coef_trans, origin_confidence, created_at
        FROM honou.products
        {where}
        ORDER BY id
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])
    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return {"count": len(rows), "items": rows}

@app.get("/metrics/categories")
def metrics_categories(limit: int = Query(20, ge=1, le=200)):
    sql = """
        SELECT category, n, avg_prod, avg_pack, avg_total
        FROM honou.mv_metrics_category
        ORDER BY avg_total DESC NULLS LAST
        LIMIT %s;
    """
    with conn.cursor() as cur:
        cur.execute(sql, (limit,))
        return cur.fetchall()
