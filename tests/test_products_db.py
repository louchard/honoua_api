import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app, Base, ProductDB, get_db

# Crée une base SQLite de test sur disque (plus fiable qu'in-memory)
TEST_DB_PATH = "./test_products.db"
if os.path.exists(TEST_DB_PATH):
    os.remove(TEST_DB_PATH)

TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    future=True
)

TestingSessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True
)

# Préparer le schéma
Base.metadata.create_all(bind=engine)

# Seed: un produit présent uniquement en BDD (pas dans la liste mémoire)
with TestingSessionLocal() as s:
    if not s.get(ProductDB, "9990000000000"):
        s.add(ProductDB(ean13_clean="9990000000000", product_name="Produit DB Test", category="CatTest"))
        s.commit()

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Override de la dépendance DB pour ce test
app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_get_product_reads_from_db_first():
    r = client.get("/products/9990000000000")
    assert r.status_code == 200

    data = r.json()
    assert data["ean13_clean"] == "9990000000000"
    assert data["product_name"] == "Produit DB Test"
    assert data["category"] == "CatTest"

