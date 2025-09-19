from fastapi import FastAPI, HTTPException, Query
from typing import Optional, Any, List
import os
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

# Pool de connexions (psycopg3)
try:
    from psycopg_pool import ConnectionPool  # pip install psycopg_pool
except ImportError:
    ConnectionPool = None  # Fallback si non installé

load_dotenv()

# DSN : priorise DATABASE_URL, puis HONOUA_DB_URL, puis variables PG*
DB_DSN = (
    os.getenv("DATABASE_URL")
    or os.getenv("HONOUA_DB_URL")
    or (
        f"host={os.getenv('PGHOST','localhost')} "
        f"port={os.getenv('PGPORT','5432')} "
        f"dbname={os.getenv('PGDATABASE','honoua')} "
        f"user={os.getenv('PGUSER','honou')} "
        f"password={os.getenv('PGPASSWORD','')}"
    )
)

app = FastAPI(title="Honoua API", version="0.1.0")

# Soit un pool, soit une connexion unique (compat ancienne version)
pool: Optional["ConnectionPool"] = None
conn: Optional["psycopg.Connection"] = None

@app.on_event("startup")
def startup():
    """
    Initialise un pool de connexions si disponible,
    sinon une connexion unique en autocommit.
    """
    global pool, conn
    if ConnectionPool is not None:
        pool = ConnectionPool(
            conninfo=DB_DSN,
            kwargs={"row_factory": dict_row},
            min_size=1,
            max_size=10,
            timeout=10,   # s à l'acquisition
        )
    else:
        conn = psycopg.connect(DB_DSN, row_factory=dict_row)
        conn.autocommit = True

@app.on_event("shutdown")
def shutdown():
    global pool, conn
    if pool:
        pool.close()
        pool = None
    if conn:
        conn.close()
        conn = None

def get_cursor():
    """
    Retourne un tuple (cn, cur) prêt à l'emploi.
    - Si pool actif: emprunte une connexion, renvoie son curseur
    - Sinon: renvoie la connexion globale et son curseur
    """
    if pool is not None:
        cn = pool.getconn()
        cn.autocommit = True
        return cn, cn.cursor()
    if conn is None:
        # Cas limite: si aucun n'est initialisé
        raise RuntimeError("Aucune connexion disponible (pool/conn non initialisé).")
    return conn, conn.cursor()

def put_conn(cn):
    """Remet la connexion dans le pool si applicable."""
    if pool is not None and cn is not None:
        pool.putconn(cn)

# ---------------------- Endpoints ----------------------

@app.get("/health")
def health():
    cn, cur = get_cursor()
    try:
        cur.execute("SELECT 1 AS ok;")
        return cur.fetchone()  # {'ok': 1}
    finally:
        cur.close()
        put_conn(cn)

@app.get("/products/{ean}")
def get_product_by_ean(ean: str):
    sql = "SELECT * FROM honou.products WHERE ean13_clean = %s LIMIT 1;"
    cn, cur = get_cursor()
    try:
        cur.execute(sql, (ean,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="EAN not found")
        return row
    finally:
        cur.close()
        put_conn(cn)

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
               origin_country, origin_lat, origin_lon, zone_geo, coef_trans,
               origin_confidence, created_at
        FROM honou.products
        {where}
        ORDER BY id
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])

    cn, cur = get_cursor()
    try:
        cur.execute(sql, params)
        rows = cur.fetchall()
        return {"count": len(rows), "items": rows}
    finally:
        cur.close()
        put_conn(cn)

@app.get("/metrics/categories")
def metrics_categories(limit: int = Query(20, ge=1, le=200)):
    sql = """
        SELECT category, n, avg_prod, avg_pack, avg_total
        FROM honou.mv_metrics_category
        ORDER BY avg_total DESC NULLS LAST
        LIMIT %s;
    """
    cn, cur = get_cursor()
    try:
        cur.execute(sql, (limit,))
        return cur.fetchall()
    finally:
        cur.close()
        put_conn(cn)
