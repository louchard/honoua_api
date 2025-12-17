import importlib
import os
import math
from sqlalchemy import String, Float, Integer, create_engine
from sqlalchemy import String, Float, BigInteger, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Mapped, mapped_column, Session
from fastapi import FastAPI, HTTPException, Depends, APIRouter, Query
from fastapi import Response
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from app.routers import cart_history
from app.routers import challenges
from app.routers import tokens
from app.routers import logs as logs_router
from app.routers import groups_a41
from app.routers import groups_a42
from app.routers import notifications as notifications_router  # 👈 IMPORTANT
from app.core.logger import logger
from app.telemetry.metrics import get_metrics_snapshot, record_request
from app.telemetry.metrics import get_prometheus_metrics
from fastapi.staticfiles import StaticFiles
#import importlib
try:
    notifications_router = importlib.import_module("app.routers.notifications")
except Exception:
    notifications_router = None
from app.routers.emissions_summary_a40 import router as emissions_summary_a40_router
from fastapi import FastAPI, HTTPException, Depends, APIRouter


# ====== FastAPI app ======
app = FastAPI(title="Honoua API")

api = APIRouter(prefix="/api")
if notifications_router is not None and hasattr(notifications_router, "router"):
    app.include_router(notifications_router.router, prefix="/notifications", tags=["notifications"])
# Middleware d'accès (A39)
from time import perf_counter


# Routeurs montés au niveau racine
app.include_router(tokens.router)        # /tokens/...
app.include_router(emissions_summary_a40_router)
app.include_router(groups_a41.router)
app.include_router(groups_a42.router)
app.include_router(cart_history.router)
app.include_router(challenges.router)
# ... après la création de l'app FastAPI
app.include_router(logs_router.router)



# Router prefixé /api pour compat front
if notifications_router is not None and hasattr(notifications_router, "router"):
    app.include_router(
        notifications_router.router,
        prefix="/notifications",
        tags=["notifications"],
    )


# Middleware d'accès (A39)
from time import perf_counter
@app.middleware("http")
async def access_log(request, call_next):
    start = perf_counter()
    response = await call_next(request)
    elapsed_ms = (perf_counter() - start) * 1000
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({elapsed_ms:.1f} ms)")
    return response


from pydantic import BaseModel
from typing import List, Optional

# ====== Modèles Pydantic (API) ======
class Product(BaseModel):
    ean: str
    name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None

class ProductSearchQuery(BaseModel):
    q: str


# ====== Données statiques (fallback mémoire) ======
_FAKE_PRODUCTS: List[Product] = [
    Product(ean="3017620422003", name="Pâte à tartiner noisettes", category="Épicerie sucrée"),
    Product(ean="3560071234567", name="Lait demi-écrémé 1L", category="Boissons"),
    Product(ean="3274080005003", name="Yaourt nature 4x125g", category="Produits laitiers"),
]

# ====== Health (racine) ======
@app.get("/health")
def health():
    env = os.getenv("ENV", "production")
    db_url = (os.getenv("DATABASE_URL") or "").strip()

    if not db_url:
        return {"status": "ok", "env": env, "db": "not_configured"}

    # Test DB léger (Option A) : SELECT 1
    try:
        # IMPORTANT: on force une connexion ponctuelle pour le diagnostic
        test_engine = create_engine(db_url, echo=False, future=True)
        with test_engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"status": "ok", "env": env, "db": "ok"}
    except Exception:
        return {"status": "ok", "env": env, "db": "error"}

    
# code pour la télémetry
@app.get("/metrics", tags=["metrics"])
async def read_metrics():
    """
    Endpoint A43.4 : expose un snapshot des métriques backend.
    On incrémente le compteur à chaque appel pour les tests.
    """
    # On enregistre une "fausse" requête de 0 ms, succès
    record_request(0.0, is_error=False)
    return get_metrics_snapshot()

# code prometheus 
@app.get("/metrics/prometheus", tags=["metrics"])
async def read_metrics_prometheus():
    return Response(
        content=get_prometheus_metrics(),
        media_type="text/plain; version=0.0.4"
    )


# ==========================
#      SQLAlchemy (DB)
# ==========================


# URL DB via .env (compose) sinon fallback SQLite local
# DB_URL = os.getenv("DATABASE_URL", "sqlite:///./honoua.db")
# APRÈS (version MVP, plus explicite)

DB_URL = (os.getenv("DATABASE_URL") or "").strip()

engine = None
SessionLocal = None

if DB_URL:
    engine = create_engine(DB_URL, echo=False, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    print("[DB] DATABASE_URL configured")
else:
    print("[DB] DATABASE_URL not configured (DB disabled)")


Base = declarative_base()

class ProductDB(Base):
    __tablename__ = "products"
    __table_args__ = {"schema": "honou"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ean13_clean: Mapped[str] = mapped_column(String, index=True)
    product_name: Mapped[str] = mapped_column(String)
    brand: Mapped[Optional[str]] = mapped_column(String)
    category: Mapped[Optional[str]] = mapped_column(String)

    # Colonnes carbone (kg CO2e)
    carbon_product_kgco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    carbon_pack_kgco2e: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Poids net (kg)
    net_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Origine
    origin_country: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    origin_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    origin_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    zone_geo: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Confiance sur l’origine / la donnée
    # origin_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

# Coordonnées de référence : centre approximatif de la France
FRANCE_LAT = 46.603354
FRANCE_LON = 1.888334

# Facteur d'émission pour le transport (kg CO2e / tonne.km)
# Valeur MVP simple à affiner plus tard.
EMISSION_FACTOR_TONNE_KM = 0.1


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcul de la distance entre deux points GPS (lat, lon) en km
    en utilisant la formule de Haversine.
    """
    # Conversion en radians
    rlat1 = math.radians(lat1)
    rlon1 = math.radians(lon1)
    rlat2 = math.radians(lat2)
    rlon2 = math.radians(lon2)

    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1

    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))

    # Rayon moyen de la Terre en km
    R = 6371.0
    return R * c


# ==========================
#        Products
# ==========================
@api.get("/products", response_model=List[Product])
def list_products():
    """Retourne la liste statique (smoke test)."""
    return _FAKE_PRODUCTS

from typing import Generator

def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="DB not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@api.get("/products/{ean}", response_model=Product)
def get_product(ean: str, db: Session = Depends(get_db)):

    try:
        db_obj = (
            db.query(ProductDB)
            .filter(ProductDB.ean13_clean == ean)
            .first()
        )
        if db_obj:
            return Product(
                ean=ean,
                name=db_obj.product_name,
                brand=db_obj.brand,       
                category=db_obj.category,
            )
    except Exception as e:
        logger.error(f"[get_product] Erreur DB pour EAN {ean}: {e}")

    raise HTTPException(status_code=404, detail="Product not found")

@api.post("/products/search", response_model=List[Product])
def search_products(query: ProductSearchQuery):
    """
    MVP (Option A): recherche uniquement en mémoire, sans dépendre de la DB.
    """
    q = (query.q or "").strip().lower()
    if not q:
        return []

    return [
        p for p in _FAKE_PRODUCTS
        if (p.name or "").lower().find(q) != -1
    ]


# ==========================
#        Compare
# ==========================
class CompareRequest(BaseModel):
    eans: list[str]

class CompareItemResult(BaseModel):
    ean: str
    carbon_kgCO2e: float | None = None

class CompareResponse(BaseModel):
    results: list[CompareItemResult]

@api.post("/compare", response_model=CompareResponse)
def compare_products(payload: CompareRequest):
    """
    Endpoint de comparaison carbone minimal (valeurs null pour préparer le front).
    """
    results = [CompareItemResult(ean=ean, carbon_kgCO2e=None) for ean in payload.eans]
    return CompareResponse(results=results)

# Monter le router /api
app.include_router(api)


# === A36 — Emissions API (squelette) ===
from pydantic import BaseModel, Field
from typing import Optional

class EmissionCalcIn(BaseModel):
    product_id: Optional[str] = Field(None, description="UUID produit ou EAN")
    category_code: str = Field(..., description="Code catégorie ex. 'BOISSONS_LIMONADE'")
    quantity: float = Field(..., gt=0, description="Quantité telle que scannée/saisie")
    quantity_unit: str = Field(..., description="g | kg | ml | l | piece")
    session_id: Optional[str] = Field(None, description="UUID session (facultatif)")
    idempotency_key: Optional[str] = Field(None, description="Clé idempotence optionnelle")

class FactorInfo(BaseModel):
    id: Optional[int] = None
    unit: Optional[str] = None
    value: Optional[float] = None
    version: Optional[str] = None
    source: Optional[str] = None

class EmissionCalcOut(BaseModel):
    id: Optional[str] = None
    emissions_gco2e: Optional[float] = None
    factor: Optional[FactorInfo] = None
    normalized_qty: Optional[float] = None
    method: Optional[str] = None
    created_at: Optional[str] = None
    session_id: Optional[str] = None
    note: str = "A36: endpoint squelette — logique à implémenter (Étapes suivantes)."

@app.post("/emissions/calc", response_model=EmissionCalcOut, tags=["emissions"])
async def calc_emissions(payload: EmissionCalcIn):
    """
    A36 — Calcul réel + idempotence (à implémenter plus tard).
    MVP: endpoint volontairement désactivé tant que la DB sync n’est pas migrée.
    """
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="DB not configured")
    raise HTTPException(status_code=501, detail="Not implemented (sync DB migration pending)")


    factor_value = float(factor_row["factor_gco2e_per_unit"])
    factor_unit = factor_row["unit"]

    # 2) Normalisation quantité (kg<->g, l<->ml)
    normalized_qty = payload.quantity
    if payload.quantity_unit == "kg" and factor_unit == "g":
        normalized_qty = payload.quantity * 1000
    elif payload.quantity_unit == "g" and factor_unit == "kg":
        normalized_qty = payload.quantity / 1000
    elif payload.quantity_unit == "l" and factor_unit == "ml":
        normalized_qty = payload.quantity * 1000
    elif payload.quantity_unit == "ml" and factor_unit == "l":
        normalized_qty = payload.quantity / 1000

    # 3) Calcul émissions
    emissions_gco2e = normalized_qty * factor_value

    # 4) UPSERT idempotent
    calc_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO emission_calculations
            (id, product_id, category_code, quantity, quantity_unit,
             normalized_qty, factor_id, emissions_gco2e, method,
             session_id, idempotency_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (idempotency_key) DO NOTHING;
        """,
        calc_id,
        payload.product_id,
        payload.category_code,
        payload.quantity,
        payload.quantity_unit,
        normalized_qty,
        factor_row["id"],
        emissions_gco2e,
        "direct_factor",
        payload.session_id,
        payload.idempotency_key,
    )

    # Si conflit, on récupère la ligne existante par la clé idempotente
    row = await conn.fetchrow(
        """
        SELECT id, emissions_gco2e, normalized_qty, method, session_id, created_at
        FROM emission_calculations
        WHERE idempotency_key = $1
        ORDER BY created_at DESC
        LIMIT 1;
        """,
        payload.idempotency_key,
    )
    await conn.close()

    # Construction de la réponse
    return EmissionCalcOut(
        id=str(row["id"]),
        emissions_gco2e=float(row["emissions_gco2e"]),
        factor=FactorInfo(
            id=factor_row["id"],
            unit=factor_row["unit"],
            value=factor_value,
            version=factor_row["version"],
            source=factor_row["source"],
        ),
        normalized_qty=float(row["normalized_qty"]),
        method=row["method"],
        created_at=(row["created_at"].isoformat() if row["created_at"] else None),
        session_id=row["session_id"],
        note="A36: calcul effectué (idempotent)",
    )

    # === A36 — Emissions History (minimal) ===
from typing import List  # noqa: E402

class EmissionHistoryItem(EmissionCalcOut):
    product_id: Optional[str] = None
    category_code: Optional[str] = None
    quantity: Optional[float] = None
    quantity_unit: Optional[str] = None

@app.get("/emissions/history", response_model=List[EmissionHistoryItem], tags=["emissions"])
async def get_emissions_history(
    product_id: Optional[str] = None,
    category_code: Optional[str] = None,
    session_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
):
    """
    A36 — Historique (à implémenter plus tard).
    MVP: endpoint volontairement désactivé tant que la DB sync n’est pas migrée.
    """
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="DB not configured")
    raise HTTPException(status_code=501, detail="Not implemented (sync DB migration pending)")



from app.routers import emissions_history
app.include_router(emissions_history.router)



# Monter le router /api (à la fin de la section API)

from app.middleware.blacklist_guard import blacklist_guard

@app.middleware("http")
async def _blacklist_guard_mw(request, call_next):
    return await blacklist_guard(request, call_next)
    
# 🔹 Notifications — montées sur l’app principale
if notifications_router is not None and hasattr(notifications_router, "router"):
    app.include_router(
        notifications_router.router,
        prefix="/notifications",
        tags=["notifications"],
    )
    # Optionnel : si tu veux aussi /api/notifications/...
    api.include_router(
        notifications_router.router,
        prefix="/notifications",
        tags=["notifications"],
    )

from fastapi.staticfiles import StaticFiles

# Servir les fichiers statiques (scanner.html)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


def compute_reliability(origin_confidence: float | None) -> tuple[int, str]:
    """
    Transforme origin_confidence en (reliability_score, reliability_level).

    - Si origin_confidence est sur 0–100 : utilisée telle quelle.
    - Si sur 0–1 : convertie en 0–100.
    - Si None : score par défaut = 30 (faible).
    """
    if origin_confidence is None:
        score = 30
    else:
        # Si la valeur semble entre 0 et 1, on la convertit en pourcentage
        if 0 <= origin_confidence <= 1:
            score = int(origin_confidence * 100)
        else:
            score = int(origin_confidence)

    if score >= 80:
        level = "élevée"
    elif score >= 40:
        level = "moyenne"
    else:
        level = "faible"

    return score, level


@app.get("/api/v1/co2/product/{ean}")
async def get_co2_product(
    ean: str,
    user_lat: float | None = Query(None),
    user_lon: float | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Endpoint MVP pour retourner les données CO₂ d’un produit à partir de l’EAN.
    Lit dans honou.products (ProductDB) et renvoie un JSON normalisé pour le front.
    """

    # 1) Validation simple de l’EAN (8 à 14 chiffres)
    if not (8 <= len(ean) <= 14) or not ean.isdigit():
        raise HTTPException(
            status_code=400,
            detail="EAN invalide (8 à 14 chiffres attendus).",
        )

    # 2) Récupération du produit dans honou.products
    stmt = select(ProductDB).where(ProductDB.ean13_clean == ean)
    result = db.execute(stmt).scalar_one_or_none()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Produit introuvable pour cet EAN.",
        )

    row = result  # alias pour la lisibilité

    # 3) Champs simples
    ean_out = row.ean13_clean
    product_name = row.product_name
    brand = row.brand
    category = row.category
    origin_country = row.origin_country

    # Valeurs brutes venant de la DB
    origin_lat_db = row.origin_lat
    origin_lon_db = row.origin_lon
    zone_geo_db = row.zone_geo

    # Correction MVP : si lat est vide mais lon + zone_geo ressemblent à des coordonnées,
    # on considère que lon_db = latitude et zone_geo_db = longitude.
    origin_lat = origin_lat_db
    origin_lon = origin_lon_db
    zone_geo = zone_geo_db


    try:
        lon_as_float = float(origin_lon_db) if origin_lon_db is not None else None
    except (TypeError, ValueError):
        lon_as_float = None

    try:
        zone_as_float = float(zone_geo_db) if zone_geo_db is not None else None
    except (TypeError, ValueError):
        zone_as_float = None

    # Heuristique simple : si origin_lat est NULL et que lon/zone sont numériques,
    # on les utilise comme latitude / longitude.
    if origin_lat_db is None and lon_as_float is not None and zone_as_float is not None:
        origin_lat = lon_as_float           # ex : 46.603354
        origin_lon = zone_as_float          # ex : 1.888334
        # zone_geo : tu peux le mettre à None ou le garder pour autre usage
        zone_geo = None


    # 4) Poids utilisé (avec fallback 0,5 kg)
    if row.net_weight_kg is not None:
        weight_kg_used = float(row.net_weight_kg)
    else:
        weight_kg_used = 0.5  # valeur par défaut (500 g)

            # 5) CO₂ production et emballage
    carbon_product_kg = float(row.carbon_product_kgco2e or 0.0)
    carbon_pack_kg = float(row.carbon_pack_kgco2e or 0.0)

    # 6) Distance et transport

    # Par défaut
    distance_km = 0.0

    # 6.1. Si on a des coordonnées d'origine, on tente d'abord utilisateur → produit
    try:
        origin_lat_f = float(origin_lat) if origin_lat is not None else None
        origin_lon_f = float(origin_lon) if origin_lon is not None else None
    except (TypeError, ValueError):
        origin_lat_f = None
        origin_lon_f = None

    # Si on a origine ET utilisateur, distance réelle origine → utilisateur
    if (
        origin_lat_f is not None
        and origin_lon_f is not None
        and user_lat is not None
        and user_lon is not None
    ):
        try:
            distance_km = haversine_km(
                origin_lat_f,
                origin_lon_f,
                float(user_lat),
                float(user_lon),
            )
        except (TypeError, ValueError):
            distance_km = 0.0

    # Si pas de distance utilisateur, mais origine connue : origine → centre France
    if distance_km == 0.0 and origin_lat_f is not None and origin_lon_f is not None:
        try:
            distance_km = haversine_km(
                origin_lat_f,
                origin_lon_f,
                FRANCE_LAT,
                FRANCE_LON,
            )
        except (TypeError, ValueError):
            distance_km = 0.0

    # 6.2. Si on n'a toujours pas de distance, on applique tes valeurs de référence
    if distance_km == 0.0:
        if origin_country == "FR":
            distance_km = 1100.0
        else:
            distance_km = 4500.0

    # 6.3. Calcul des émissions de transport
    weight_tonnes = weight_kg_used / 1000.0
    carbon_transport_kg = distance_km * weight_tonnes * EMISSION_FACTOR_TONNE_KM

    # 7) Total CO₂
    carbon_total_kg = carbon_product_kg + carbon_pack_kg + carbon_transport_kg


       # 8) Fiabilité (MVP : fixée à "moyenne")
    reliability_score = 60
    reliability_level = "moyenne"

    # 9) Construction du JSON final conforme au contrat validé
    return {
        "ean": ean_out,
        "product_name": product_name,
        "brand": brand,
        "category": category,

        "carbon_product_kg": carbon_product_kg,
        "carbon_pack_kg": carbon_pack_kg,
        "carbon_transport_kg": carbon_transport_kg,
        "carbon_total_kg": carbon_total_kg,

        "weight_kg_used": weight_kg_used,
        "distance_km": distance_km,

        "reliability_score": reliability_score,
        "reliability_level": reliability_level,

        "origin_country": origin_country,
        "origin_lat": origin_lat,
        "origin_lon": origin_lon,
        "zone_geo": zone_geo,
    }

