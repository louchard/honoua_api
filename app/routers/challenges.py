from __future__ import annotations

from datetime import datetime, timedelta
import calendar
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text

# IMPORTANT: aligne l'import get_db avec ton projet.
# Dans ton repo, tu as app\db\deps.py: def get_db() (confirmé).
from app.db.deps import get_db

from app.schemas.challenges import (
    ChallengeRead,
    ChallengeActivateRequest,
    ChallengeInstanceRead,
    ChallengeEvaluateResponse,
)

router = APIRouter(tags=["challenges"])


def _require_session_id(x_session_id: Optional[str]) -> str:
    session_id = (x_session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-Id header")
    return session_id


# ---------- 1) Lister les défis disponibles (catalogue) ---------- #

@router.get("/challenges", response_model=list[ChallengeRead])
def list_challenges(db: Session = Depends(get_db)):
    """
    Retourne la liste des défis CO2 disponibles (catalogue).
    Lit la table 'challenges' et ne renvoie que les défis actifs (active = 1).
    """
    query = text("""
        SELECT
            id,
            code,
            name,
            description,
            metric,
            logic_type,
            period_type,
            default_target_value,
            scope_type,
            active
        FROM challenges
        WHERE active = 1
        ORDER BY id;
    """)

    try:
        rows = db.execute(query).mappings().all()
    except Exception as e:
        print("[Challenges][WARN] Table 'challenges' absente ? Retour []. Détail:", e)
        return []

    return [ChallengeRead(**row) for row in rows]




# ---------- 2) Activer un défi (cible: session) ---------- #

@router.post("/challenges/personal/activate", response_model=ChallengeInstanceRead)
def activate_challenge(
    payload: ChallengeActivateRequest,
    db: Session = Depends(get_db),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Active un défi pour la session courante et crée une instance de défi.
    MVP:
    - récupère le défi (challenges)
    - déduit start_date / end_date selon period_type
    - crée une ligne dans challenge_instances
    - initialise status='en_cours' et target_value=default_target_value
    """
    session_id = _require_session_id(x_session_id)

    # 1) Récupérer le défi demandé
    challenge_row = db.execute(
        text("""
            SELECT
                id,
                code,
                name,
                description,
                metric,
                logic_type,
                period_type,
                default_target_value,
                scope_type,
                active
            FROM challenges
            WHERE id = :challenge_id
              AND active = 1
        """),
        {"challenge_id": payload.challenge_id},
    ).mappings().first()

    if challenge_row is None:
        raise HTTPException(status_code=404, detail="Défi introuvable ou inactif.")

    period_type = challenge_row["period_type"]
    now = datetime.utcnow()

    # 2) Déterminer start_date et end_date (simple)
    if period_type == "30_jours_glissants":
        start_date = now
        end_date = now + timedelta(days=30)
    elif period_type == "7_jours_glissants":
        start_date = now
        end_date = now + timedelta(days=7)
    elif period_type == "mois_calendaire":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day = calendar.monthrange(now.year, now.month)[1]
        end_date = start_date.replace(day=last_day, hour=23, minute=59, second=59, microsecond=0)
    else:
        start_date = now
        end_date = now + timedelta(days=30)

    # 3) Valeurs instance
    status = "en_cours"
    created_at = now
    reference_value = None
    current_value = None
    progress_percent = None
    target_value = float(challenge_row["default_target_value"])

    # 4) Insert instance
    insert_sql = text("""
        INSERT INTO challenge_instances (
            challenge_id,
            target_type,
            target_id,
            start_date,
            end_date,
            status,
            reference_value,
            current_value,
            target_value,
            progress_percent,
            created_at,
            last_evaluated_at
        ) VALUES (
            :challenge_id,
            :target_type,
            :target_id,
            :start_date,
            :end_date,
            :status,
            :reference_value,
            :current_value,
            :target_value,
            :progress_percent,
            :created_at,
            :last_evaluated_at
        )
    """)

    params = {
        "challenge_id": challenge_row["id"],
        "target_type": "session",
        "target_id": session_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "status": status,
        "reference_value": reference_value,
        "current_value": current_value,
        "target_value": target_value,
        "progress_percent": progress_percent,
        "created_at": created_at.isoformat(),
        "last_evaluated_at": None,
    }

    result = db.execute(insert_sql, params)
    db.commit()
    instance_id = result.lastrowid

    # 5) Relire l'instance (join challenges)
    select_sql = text("""
        SELECT
            ci.id AS instance_id,
            ci.challenge_id,
            c.code,
            c.name,
            c.description,
            c.metric,
            c.logic_type,
            c.period_type,
            ci.status,
            ci.start_date,
            ci.end_date,
            ci.reference_value,
            ci.current_value,
            ci.target_value,
            ci.progress_percent,
            ci.created_at,
            ci.last_evaluated_at
        FROM challenge_instances AS ci
        JOIN challenges AS c
            ON ci.challenge_id = c.id
        WHERE ci.id = :instance_id
    """)

    row = db.execute(select_sql, {"instance_id": instance_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de l'instance de défi.")

    return ChallengeInstanceRead(**row)


# ---------- 3) Lister les défis actifs (cible: session) ---------- #

@router.get("/challenges/personal/active", response_model=list[ChallengeInstanceRead])
def get_active_challenges(
    db: Session = Depends(get_db),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Retourne la liste des défis actifs pour la session.
    Robuste: si tables manquantes -> [].
    """
    session_id = _require_session_id(x_session_id)

    sql = text("""
        SELECT
            ci.id AS instance_id,
            ci.challenge_id,
            c.code,
            c.name,
            c.description,
            c.metric,
            c.logic_type,
            c.period_type,
            ci.status,
            ci.start_date,
            ci.end_date,
            ci.reference_value,
            ci.current_value,
            ci.target_value,
            ci.progress_percent,
            ci.created_at,
            ci.last_evaluated_at
        FROM challenge_instances AS ci
        JOIN challenges AS c
            ON ci.challenge_id = c.id
        WHERE ci.target_type = 'session'
          AND ci.target_id = :session_id
          AND ci.status = 'en_cours'
        ORDER BY ci.created_at DESC
    """)

    try:
        rows = db.execute(sql, {"session_id": session_id}).mappings().all()
    except Exception as e:
        print("[Challenges][WARN] Impossible de charger les défis actifs -> retour []. Détail:", e)
        return []

    return [ChallengeInstanceRead(**r) for r in rows]


# ---------- 4) Réévaluer un défi (cible: session) ---------- #

@router.post("/challenges/personal/{instance_id}/evaluate", response_model=ChallengeEvaluateResponse)
def evaluate_challenge(
    instance_id: int,
    db: Session = Depends(get_db),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Réévalue un défi (recalcule la progression et le statut) pour la session.
    MVP: prise en charge du défi CO2 réduction relative sur 30 jours glissants.
    """
    session_id = _require_session_id(x_session_id)
    now = datetime.utcnow()

    # 1) Récupérer instance + défi
    select_sql = text("""
        SELECT
            ci.id AS instance_id,
            ci.challenge_id,
            ci.target_type,
            ci.target_id,
            ci.start_date,
            ci.end_date,
            ci.status,
            ci.reference_value,
            ci.current_value,
            ci.target_value,
            ci.progress_percent,
            ci.created_at,
            ci.last_evaluated_at,
            c.code,
            c.name,
            c.metric,
            c.logic_type,
            c.period_type
        FROM challenge_instances AS ci
        JOIN challenges AS c
            ON ci.challenge_id = c.id
        WHERE ci.id = :instance_id
          AND ci.target_type = 'session'
          AND ci.target_id = :session_id
    """)

    row = db.execute(
        select_sql,
        {"instance_id": instance_id, "session_id": session_id},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Instance de défi introuvable pour cette session.")

    # MVP : uniquement CO2 / reduction_relative / 30_jours_glissants
    if not (
        row["metric"] == "co2"
        and row["logic_type"] == "reduction_relative"
        and row["period_type"] == "30_jours_glissants"
    ):
        raise HTTPException(status_code=400, detail="Ce type de défi n'est pas encore pris en charge.")

    # 2) Dates
    try:
        start_date = datetime.fromisoformat(row["start_date"])
        end_date = datetime.fromisoformat(row["end_date"])
    except Exception:
        raise HTTPException(status_code=500, detail="Format de date invalide dans l'instance de défi.")

    # Période de référence: 30 jours avant le début
    periode_ref_fin = start_date
    periode_ref_debut = start_date - timedelta(days=30)

    # Période actuelle: pendant le défi (jusqu'à now ou end_date)
    periode_actuelle_debut = start_date
    periode_actuelle_fin = end_date if now > end_date else now

    # 3) Sommes CO2 depuis co2_cart_history (par session_id)
    ref_sql = text("""
        SELECT SUM(total_co2_g) AS total_co2_g
          FROM co2_cart_history
         WHERE session_id = :session_id
           AND created_at >= :start
           AND created_at < :end
    """)

    cur_sql = text("""
        SELECT SUM(total_co2_g) AS total_co2_g
          FROM co2_cart_history
         WHERE session_id = :session_id
           AND created_at >= :start
           AND created_at <= :end
    """)

    ref_row = db.execute(
        ref_sql,
        {"session_id": session_id, "start": periode_ref_debut.isoformat(), "end": periode_ref_fin.isoformat()},
    ).mappings().first()

    cur_row = db.execute(
        cur_sql,
        {"session_id": session_id, "start": periode_actuelle_debut.isoformat(), "end": periode_actuelle_fin.isoformat()},
    ).mappings().first()

    count_sql = text("""
    SELECT COUNT(1) AS n
      FROM co2_cart_history
     WHERE session_id = :session_id
       AND created_at >= :start
       AND created_at <= :end
""")

    count_row = db.execute(
          count_sql,
          {"session_id": session_id, "start": periode_actuelle_debut.isoformat(), "end": periode_actuelle_fin.isoformat()},
    ).mappings().first()

    nb_paniers_actuels = int(count_row["n"]) if count_row and count_row["n"] is not None else 0


    reference_value = (
        float(ref_row["total_co2_g"]) / 1000.0
        if ref_row and ref_row["total_co2_g"] is not None
        else None
    )

    current_value = (
        float(cur_row["total_co2_g"]) / 1000.0
        if cur_row and cur_row["total_co2_g"] is not None
        else 0.0
    )

    target_value = float(row["target_value"]) if row["target_value"] is not None else 0.10


    # 4) Calcul progression
    progress_percent: float | None = None
    status = row["status"]
    message = ""

    if reference_value is None or reference_value <= 0:
        if now < end_date:
            status = "en_cours"
            progress_percent = None
            message = "Pas encore assez d'historique CO₂ pour évaluer ce défi. Continue à scanner."
        else:
            status = "expire"
            progress_percent = None
            message = "Défi terminé mais pas assez d'historique CO₂ pour calculer une réduction."
    else:
        if nb_paniers_actuels == 0:
            status = "en_cours"
            message = "Ajoutez au moins un panier sur la periode en cours pour valider la progression."
            progress_percent = None
        elif reduction >= target_value:
            status = "reussi"
            message = "Bravo ! Objectif de réduction CO2 atteint." if now < end_date else "Bravo ! Défi réussi sur 30 jours."
        else:
            if now < end_date:
                status = "en_cours"
                message = f"Réduction actuelle : {reduction * 100:.1f} %, objectif : {target_value * 100:.0f} %."
            else:
                status = "echoue"
                message = f"Défi terminé. Réduction : {reduction * 100:.1f} %, objectif : {target_value * 100:.0f} %."


    # 5) Update DB
    update_sql = text("""
        UPDATE challenge_instances
           SET reference_value = :reference_value,
               current_value = :current_value,
               target_value = :target_value,
               progress_percent = :progress_percent,
               status = :status,
               last_evaluated_at = :last_evaluated_at
         WHERE id = :instance_id
    """)

    db.execute(
        update_sql,
        {
            "reference_value": reference_value,
            "current_value": current_value,
            "target_value": target_value,
            "progress_percent": progress_percent,
            "status": status,
            "last_evaluated_at": now.isoformat(),
            "instance_id": instance_id,
        },
    )
    db.commit()

    return ChallengeEvaluateResponse(
        instance_id=row["instance_id"],
        challenge_id=row["challenge_id"],
        code=row["code"],
        name=row["name"],
        status=status,
        current_value=current_value,
        reference_value=reference_value,
        target_value=target_value,
        progress_percent=progress_percent,
        last_evaluated_at=now,
        message=message,
    )
@router.post("/challenges/_init")
def init_challenges_tables(db: Session = Depends(get_db)):
    """
    DEV uniquement (SQLite) : crée les tables challenges + challenge_instances
    et insère 1 défi par défaut si vide.
    """
    # 1) Tables
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            metric TEXT NOT NULL,
            logic_type TEXT NOT NULL,
            period_type TEXT NOT NULL,
            default_target_value REAL NOT NULL,
            scope_type TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS challenge_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL,
            reference_value REAL,
            current_value REAL,
            target_value REAL,
            progress_percent REAL,
            created_at TEXT NOT NULL,
            last_evaluated_at TEXT
        );
    """))

    # 2) Seed minimal (si vide)
    count = db.execute(text("SELECT COUNT(1) AS n FROM challenges;")).mappings().first()["n"]
    if int(count) == 0:
        db.execute(text("""
            INSERT INTO challenges (
                code, name, description, metric, logic_type, period_type, default_target_value, scope_type, active
            ) VALUES (
                'CO2_30D_MINUS_10',
                'Reduire -10% CO2 sur 30 jours',
                'Objectif : reduire vos emissions CO2 de 10% par rapport aux 30 jours précédents.',
                'co2',
                'reduction_relative',
                '30_jours_glissants',
                0.10,
                'personal',
                1
            );
        """))

    db.commit()
    return {"status": "ok"}

    

