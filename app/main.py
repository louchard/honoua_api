from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Honoua API")

# ====== Modèles (simples) ======
class Product(BaseModel):
    ean: str
    name: Optional[str] = None
    category: Optional[str] = None

class ProductSearchQuery(BaseModel):
    q: str

# ====== Données statiques (placeholder) ======
_FAKE_PRODUCTS: List[Product] = [
    Product(ean="3017620422003", name="Pâte à tartiner noisettes", category="Épicerie sucrée"),
    Product(ean="3560071234567", name="Lait demi-écrémé 1L", category="Boissons"),
    Product(ean="3274080005003", name="Yaourt nature 4x125g", category="Produits laitiers"),
]

# ====== Health ======
@app.get("/health")
def health():
    return {"status": "ok"}

# ====== Products ======
@app.get("/products", response_model=List[Product])
def list_products():
    """
    Retourne la liste statique des produits (smoke test).
    """
    return _FAKE_PRODUCTS

@app.get("/products/{ean}", response_model=Product)
def get_product(ean: str):
    """
    Retourne un produit par EAN. 404 si non trouvé.
    """
    for p in _FAKE_PRODUCTS:
        if p.ean == ean:
            return p
    raise HTTPException(status_code=404, detail="Product not found")

@app.post("/products/search", response_model=List[Product])
def search_products(query: ProductSearchQuery):
    """
    Recherche très simple par nom (contains, case-insensitive).
    À remplacer plus tard par une recherche BDD.
    """
    q = (query.q or "").strip().lower()
    if not q:
        return []
    return [p for p in _FAKE_PRODUCTS if p.name and q in p.name.lower()]

from pydantic import BaseModel

# ====== Compare ======
class CompareRequest(BaseModel):
    eans: list[str]

class CompareItemResult(BaseModel):
    ean: str
    carbon_kgCO2e: float | None = None

class CompareResponse(BaseModel):
    results: list[CompareItemResult]


@app.post("/compare", response_model=CompareResponse)
def compare_products(payload: CompareRequest):
    """
    Endpoint de comparaison carbone minimal.
    Pour chaque EAN reçu, renvoie un résultat vide (carbon_kgCO2e = null)
    afin de tester le flux front–API.
    """
    results = [CompareItemResult(ean=ean, carbon_kgCO2e=None) for ean in payload.eans]
    return CompareResponse(results=results)

