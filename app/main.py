from fastapi import FastAPI, HTTPException, Depends
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

# ====== FastAPI app ======
app = FastAPI(title="Honoua API")

# Router prefixé /api pour compat front
api = APIRouter(prefix="/api")

# ====== Modèles Pydantic (API) ======
class Product(BaseModel):
    ean: str
    name: Optional[str] = None
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
    return {"status": "ok"}

# ==========================
#      SQLAlchemy (DB)
# ==========================
import os
from sqlalchemy import String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Mapped, mapped_column, Session

# URL DB via .env (compose) sinon fallback SQLite local
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./honoua.db")

# Pour SQLite, besoin de ce connect_args
connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

class ProductDB(Base):
    __tablename__ = "products"
    ean: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)

# Création des tables si besoin (no-op si déjà existantes)
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    # Pas bloquant si la DB n’est pas prête — on garde le fallback mémoire
    pass

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================
#        Products
# ==========================
@api.get("/products", response_model=List[Product])
def list_products():
    """Retourne la liste statique (smoke test)."""
    return _FAKE_PRODUCTS

@api.get("/products/{ean}", response_model=Product)
def get_product(ean: str, db: Session = Depends(get_db)):
    """
    Lecture en BDD (si présente), sinon fallback mémoire.
    """
    # 1) Essayer la BDD
    try:
        db_obj = db.get(ProductDB, ean)
        if db_obj:
            return Product(ean=db_obj.ean, name=db_obj.name, category=db_obj.category)
    except Exception:
        # Si la BDD n'est pas dispo ou autre erreur, on ignore et on tente le fallback
        pass

    # 2) Fallback mémoire
    for p in _FAKE_PRODUCTS:
        if p.ean == ean:
            return p
    raise HTTPException(status_code=404, detail="Product not found")

@api.post("/products/search", response_model=List[Product])
def search_products(query: ProductSearchQuery, db: Session = Depends(get_db)):
    """
    Recherche très simple par nom. On tente la BDD d'abord (full scan),
    sinon on revient au fallback mémoire.
    """
    q = (query.q or "").strip().lower()
    if not q:
        return []

    results: List[Product] = []
    # 1) Essayer la BDD (si table existe)
    try:
        rows = db.query(ProductDB).all()
        for row in rows:
            if row.name and q in row.name.lower():
                results.append(Product(ean=row.ean, name=row.name, category=row.category))
    except Exception:
        # Si erreur DB, on ignore
        pass

    # 2) Fallback mémoire (compléter les résultats)
    seen = {r.ean for r in results}
    for p in _FAKE_PRODUCTS:
        if p.name and q in p.name.lower() and p.ean not in seen:
            results.append(p)

    return results

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
