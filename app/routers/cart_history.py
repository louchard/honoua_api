# app/routers/cart_history.py

import os
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

# ==========================
#      Connexion DB
# ==========================
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./honoua.db")

# Pour SQLite, même logique que dans main.py
connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Session:
    """
    Session DB locale à ce router.
    (Évite les imports circulaires avec app.main)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================
#      Modèles Pydantic
# ==========================

class CartHistoryCreate(BaseModel):
    total_co2_g: int
    nb_articles: int
    nb_distinct_products: int
    total_distance_km: float
    days_captured_by_tree: float
    tree_equivalent: float


class CartHistoryResponse(BaseModel):
    id: int
    status: str
    validated_at: datetime
    period_month: str
    period_week: str

class CartHistoryItem(BaseModel):
    id: int
    user_id: Optional[str]
    period_type: str
    period_label: str
    total_co2_g: int
    nb_articles: int
    nb_distinct_products: int
    total_distance_km: float
    days_captured_by_tree: float
    tree_equivalent: float
    created_at: datetime



# ==========================
#          Router
# ==========================
router = APIRouter(prefix="/api/cart", tags=["cart"])


@router.post("/history", response_model=CartHistoryResponse)
async def create_cart_history(
    payload: CartHistoryCreate,
    db: Session = Depends(get_db),
    x_honoua_user_id: Optional[str] = Header(None, alias="X-Honoua-User-Id"),
):

    """
    Endpoint appelé quand l’utilisateur valide son Panier CO₂.

    - Reçoit les métriques du panier (total CO2, nb articles, distance, arbres)
    - Calcule la date de validation et les périodes (mois / semaine)
    - Insère une ligne dans honou.co2_cart_history
    - Renvoie un objet de confirmation
    """

    # ✅ INSÉRER ICI (juste avant "# 1) Date / heure actuelle (UTC)")
    if not x_honoua_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Honoua-User-Id")


    # 1) Date / heure actuelle (UTC)
    now = datetime.now(timezone.utc)

    # 2) Clés de période
    year, week_num, _ = now.isocalendar()          # ex : (2025, 47, 3)
    period_month = now.strftime("%Y-%m")           # ex : "2025-11"
    period_week = f"{year}-W{week_num:02d}"        # ex : "2025-W47"

    # 3) Paramètres pour l'INSERT (adaptés à la table SQLite co2_cart_history)
    # On choisit de stocker ici une agrégation "mensuelle" :
    #   - period_type  = "month"
    #   - period_label = "YYYY-MM" (ex : "2025-11")
    params = {
        "user_id": x_honoua_user_id,  # pas de multi-profil pour le moment
        "period_type": "month",
        "period_label": period_month,
        "total_co2_g": payload.total_co2_g,
        "nb_articles": payload.nb_articles,
        "nb_distinct_products": payload.nb_distinct_products,
        "total_distance_km": payload.total_distance_km,
        "days_captured_by_tree": payload.days_captured_by_tree,
        "tree_equivalent": payload.tree_equivalent,
        "created_at": now.isoformat(),
    }

    # 4) INSERT adapté à la structure réelle de la table SQLite
    stmt = text("""
        INSERT INTO honou.co2_cart_history (
            user_id,
            period_type,
            period_label,
            total_co2_g,
            nb_articles,
            nb_distinct_products,
            total_distance_km,
            days_captured_by_tree,
            tree_equivalent,
            created_at
        ) VALUES (
            :user_id,
            :period_type,
            :period_label,
            :total_co2_g,
            :nb_articles,
            :nb_distinct_products,
            :total_distance_km,
            :days_captured_by_tree,
            :tree_equivalent,
            :created_at
        )
        RETURNING id;
    """)

    try:
        # Exécution de l'INSERT + récupération de l'ID (compatible PostgreSQL + SQLite récent)
        result = db.execute(stmt, params)
        new_id = result.scalar_one()
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'enregistrement de l'historique du panier CO₂ : {e}",
        )

    return CartHistoryResponse(
        id=new_id,
        status="ok",
        validated_at=now,
        period_month=period_month,
        period_week=period_week,
    )



@router.get("/history", response_model=List[CartHistoryItem])
def list_cart_history(
    limit: int = 50,
    x_honoua_user_id: Optional[str] = Header(None, alias="X-Honoua-User-Id"),
):

    """
    Retourne les `limit` derniers paniers CO2, du plus récent au plus ancien.
    """

    # ✅ INSÉRER ICI (juste avant "db = SessionLocal()")
    if not x_honoua_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Honoua-User-Id")
    
    try:
        user_id = int(x_honoua_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid X-Honoua-User-Id (integer expected)")

    db = SessionLocal()
    try:
        stmt = text("""
            SELECT
                id,
                user_id,
                period_type,
                period_label,
                total_co2_g,
                nb_articles,
                nb_distinct_products,
                total_distance_km,
                days_captured_by_tree,
                tree_equivalent,
                created_at
            FROM honou.co2_cart_history
            WHERE user_id = :user_id
            ORDER BY id DESC
            LIMIT :limit;
        """)


        result = db.execute(stmt, {"limit": limit, "user_id": user_id})
        rows = result.fetchall()

        items = [
            CartHistoryItem(
                id=row[0],
                user_id=str(row[1]),
                period_type=row[2],
                period_label=row[3],
                total_co2_g=row[4],
                nb_articles=row[5],
                nb_distinct_products=row[6],
                total_distance_km=row[7],
                days_captured_by_tree=row[8],
                tree_equivalent=row[9],
                created_at=row[10],
            )
            for row in rows
        ]

        return items

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération de l'historique des paniers CO₂ : {e}",
        )
    finally:
        db.close()

