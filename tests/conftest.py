# tests/conftest.py

import os
import tempfile
import importlib
from typing import Iterable, List, Set

import httpx
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text



# ---------------------------------------------------------------------
# IMPORTANT : DATABASE_URL doit être défini AVANT l'import de l'app
# ---------------------------------------------------------------------
_fd, _path = tempfile.mkstemp(prefix="honoua_test_", suffix=".sqlite")
os.close(_fd)
TEST_DATABASE_URL = f"sqlite:///{_path}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL


# ---------------------------------------------------------------------
# Import app (après DATABASE_URL)
# ---------------------------------------------------------------------
from app.main import app  # noqa: E402


def _safe_import_attr(module_path: str, attr: str):
    try:
        mod = importlib.import_module(module_path)
        return getattr(mod, attr, None)
    except Exception:
        return None


def _collect_bases() -> List[object]:
    """
    Récupère toutes les bases SQLAlchemy plausibles (Base.metadata.create_all()).
    On évite de supposer une seule Base.
    """
    candidates = [
        ("app.main", "Base"),
        ("app.db.base", "Base"),
        ("app.db.database", "Base"),
        ("app.db.models", "Base"),
    ]

    bases: List[object] = []
    seen_ids: Set[int] = set()
    for mod, attr in candidates:
        b = _safe_import_attr(mod, attr)
        if b is not None and hasattr(b, "metadata"):
            if id(b) not in seen_ids:
                bases.append(b)
                seen_ids.add(id(b))
    return bases


def _collect_get_db_deps() -> List[object]:
    """
    Récupère toutes les dépendances get_db plausibles afin d'override
    celles réellement utilisées par les routeurs (logs/notifications/products).
    """
    candidates = [
        ("app.main", "get_db"),
        ("app.db.deps", "get_db"),
        ("app.db.session", "get_db"),
        ("app.db.database", "get_db"),
        ("app.db", "get_db"),
    ]

    deps: List[object] = []
    seen_ids: Set[int] = set()
    for mod, attr in candidates:
        fn = _safe_import_attr(mod, attr)
        if fn is not None and callable(fn):
            if id(fn) not in seen_ids:
                deps.append(fn)
                seen_ids.add(id(fn))
    return deps


@pytest.fixture(scope="session")
def _test_db_url():
    yield TEST_DATABASE_URL
    try:
        os.remove(_path)
    except OSError:
        pass


@pytest.fixture(scope="session")
def _engine(_test_db_url):
    # Engine unique pour toute la suite
    return create_engine(_test_db_url, connect_args={"check_same_thread": False})


@pytest.fixture(scope="session")
def _SessionLocal(_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="session", autouse=True)
def _create_schema(_engine):
    """
    Crée les tables pour toutes les Base trouvées.
    Critique: importer les routeurs (et/ou modèles) AVANT create_all().
    """
    # Imports "chauffe" pour enregistrer les modèles
    for mod in [
        "app.models",
        "app.db.models",
        "app.routers.logs",
        "app.routers.notifications",
        "app.routers.products",
    ]:
        try:
            importlib.import_module(mod)
        except Exception:
            pass

    bases = _collect_bases()
    for b in bases:
        b.metadata.create_all(bind=_engine)
    # --- Garantir les tables attendues par les tests, même si les modèles ne sont pas rattachés au Base importé ---
    with _engine.begin() as conn:
        # Table logs
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
        """))

        # Table notifications
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS user_notification_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            enabled INTEGER NOT NULL DEFAULT 1,
            allow_email INTEGER NOT NULL DEFAULT 1,
            allow_push INTEGER NOT NULL DEFAULT 1,
            allow_sms INTEGER NOT NULL DEFAULT 0,
            frequency TEXT NOT NULL DEFAULT 'immediate',
            types TEXT,
            last_notified_at TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
        """))


    yield

    # Drop dans l'ordre inverse (prudence)
    for b in reversed(bases):
        b.metadata.drop_all(bind=_engine)


def _override_get_db_factory(_SessionLocal):
    def _override_get_db():
        db = _SessionLocal()
        try:
            yield db
        finally:
            db.close()
    return _override_get_db


def _apply_db_overrides(_SessionLocal):
    """
    Override toutes les dépendances get_db détectées.
    """
    override = _override_get_db_factory(_SessionLocal)
    for dep in _collect_get_db_deps():
        app.dependency_overrides[dep] = override


@pytest.fixture(scope="function")
def client(_SessionLocal):
    _apply_db_overrides(_SessionLocal)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def app_client(_SessionLocal):
    _apply_db_overrides(_SessionLocal)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()

    # --- SAFETY: reset FastAPI dependency overrides between tests ---
import pytest
from app.main import app

@pytest.fixture(autouse=True)
def _reset_dependency_overrides():
    """
    Empêche la pollution d'état entre tests (override get_db, etc.).
    Symptom: un test passe seul mais échoue dans la suite.
    """
    yield
    app.dependency_overrides.clear()

