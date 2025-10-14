from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_list_products_ok():
    r = client.get("/products")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    assert {"ean", "name", "category"}.issubset(data[0].keys())

def test_get_product_found():
    r = client.get("/products/3560071234567")  # Lait
    assert r.status_code == 200
    data = r.json()
    assert data["ean"] == "3560071234567"
    assert "Lait" in data["name"]

def test_get_product_not_found():
    r = client.get("/products/0000000000000")
    assert r.status_code == 404
    assert r.json()["detail"] == "Product not found"

def test_search_products():
    r = client.post("/products/search", json={"q": "yaourt"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any("yaourt" in item["name"].lower() for item in data)
