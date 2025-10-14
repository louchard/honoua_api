import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app, Base, ProductDB, get_db

# === BDD de test (SQLite fichier) ===
TEST_DB_PATH = "./test_create_products.db"
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"

# -- Assure une base propre à chaque run --
if os.path.exists(TEST_DB_PATH):
    os.remove(TEST_DB_PATH)

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, future=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_create_product_and_fetch_back():
    ean = "7770000000001"
    payload = {"ean": ean, "name": "Produit inséré test", "category": "TestCat"}
    r = client.post("/products", json=payload)
    assert r.status_code == 201

    r2 = client.get(f"/products/{ean}")
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["name"] == "Produit inséré test"
    assert data2["category"] == "TestCat"

def test_create_product_conflict():
    ean = "7770000000002"
    payload = {"ean": ean, "name": "Produit A"}
    r1 = client.post("/products", json=payload)
    assert r1.status_code == 201

    r2 = client.post("/products", json=payload)
    assert r2.status_code == 409
    assert r2.json()["detail"] == "Product already exists"
