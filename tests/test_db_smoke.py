# tests/test_db_smoke.py
import os

def test_db_smoke_import():
    # Doit pouvoir importer le module sans erreur
    import app.db  # noqa: F401

def test_db_smoke_select1():
    # Si HONOUA_DB_URL est défini, on teste la connexion réelle (Postgres en CI)
    # Sinon fallback SQLite local.
    from app.db import smoke, db_url
    assert smoke() is True, f"DB smoke failed for URL: {db_url()}"
