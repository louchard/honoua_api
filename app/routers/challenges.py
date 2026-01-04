from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import calendar
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError



from app.schemas.challenges import (
    ChallengeRead,
    ChallengeActivateRequest,
    ChallengeInstanceRead,
    ChallengeEvaluateResponse,
)
from app.db import get_db # adapte ce chemin si besoin


router = APIRouter(
    tags=["challenges"]
)


# ---------- 1) Lister les défis disponibles ---------- #
@router.get("/challenges", response_model=list[ChallengeRead])
def list_challenges(db: Session = Depends(get_db)):
    try:
        rows = db.execute(
            text("""
                SELECT
                    id,
                    code,
                    COALESCE(name, title, code) AS name,
                    metric,
                    logic_type,
                    period_type,
                    default_target_value,
                    scope_type AS scope_type,
                    COALESCE(active, is_active, TRUE) AS active
                FROM public.challenges
                WHERE COALESCE(active, is_active, TRUE) = TRUE
                ORDER BY id ASC
            """)
        ).mappings().all()

        return [dict(r) for r in rows]

    except (OperationalError, ProgrammingError):
        return []


# ---------- 2) Activer un défi pour un utilisateur ---------- #

@router.post(
    "/users/{user_id}/challenges/activate",
    response_model=ChallengeInstanceRead,
)
def activate_challenge(
    user_id: int,
    payload: ChallengeActivateRequest,
    db: Session = Depends(get_db),
):
    """
    Active un défi pour un utilisateur et crée une instance de défi.
    Version MVP simple :
    - récupère le défi (challenges)
    - déduit start_date / end_date selon period_type
    - crée une ligne dans challenge_instances
    - initialise status='en_cours' et target_value=default_target_value
    - ne calcule pas encore les valeurs métier complexes (reference_value, etc.)
    """

    challenge_row = db.execute(
        text("""
            SELECT
                id,
                code,
                COALESCE(name, title, code) AS name,
                NULL::text AS description,
                metric,
                logic_type,
                period_type,
                default_target_value,
                scope_type AS scope_type,
                COALESCE(active, is_active, TRUE) AS active
            FROM public.challenges
            WHERE id = :challenge_id
              AND COALESCE(active, is_active, TRUE) IS TRUE
        """),
        {"challenge_id": payload.challenge_id},
    ).mappings().first()

    
    if challenge_row is None:
        raise HTTPException(
            status_code=404,
            detail="Défi introuvable ou inactif."
        )

    period_type = challenge_row["period_type"]

    # 2) Déterminer start_date et end_date (version simple)
    now = datetime.utcnow()

    if period_type == "30_jours_glissants":
        start_date = now
        end_date = now + timedelta(days=30)

    elif period_type == "7_jours_glissants":
        start_date = now
        end_date = now + timedelta(days=7)

    elif period_type == "mois_calendaire":
        # début du mois courant
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # fin du mois courant (23:59:59)
        last_day = calendar.monthrange(now.year, now.month)[1]
        end_date = start_date.replace(
            day=last_day,
            hour=23,
            minute=59,
            second=59,
            microsecond=0,
        )
    else:
        # Sécurité : fallback générique = 30 jours
        start_date = now
        end_date = now + timedelta(days=30)

    # 3) Préparer les valeurs à insérer dans challenge_instances
    status = "en_cours"
    created_at = now

    # MVP : on ne calcule pas encore reference_value / current_value / progress_percent
    reference_value = None
    current_value = None
    progress_percent = None

    # On copie l'objectif par défaut du défi
    target_value = float(challenge_row["default_target_value"])

    # 4) Insérer l'instance dans la base
    insert_sql = text(
        """
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
        """
    )

    params = {
        "challenge_id": challenge_row["id"],
        "target_type": "user",
        "target_id": user_id,
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

    result = db.execute(
    text("""
        INSERT INTO public.challenge_instances (
            challenge_id,
            user_id,
            period_start,
            period_end,
            status,
            created_at,
            updated_at
        )
        VALUES (
            :challenge_id,
            :user_id,
            :period_start,
            :period_end,
            'ACTIVE',
            NOW(),
            NOW()
        )
        RETURNING id
    """),
            {
                "challenge_id": challenge_id,
                "user_id": user_id,
                "period_start": period_start,
                "period_end": period_end,
            },
        )

    instance_id = result.scalar_one()
    db.commit()


    # 5) Relire l'instance insérée avec jointure sur challenges
    select_sql = text(
        """
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
        """
    )

    row = db.execute(select_sql, {"instance_id": instance_id}).mappings().first()
    if row is None:
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de la création de l'instance de défi."
        )

    # Pydantic se charge de parser les dates ISO en datetime
    return ChallengeInstanceRead(**row)



# ---------- 3) Lister les défis actifs d'un utilisateur ---------- #

@router.get(
    "/users/{user_id}/challenges/active",
    response_model=list[ChallengeInstanceRead],
)
def get_active_challenges(
    user_id: int,
    db: Session = Depends(get_db),
):
    """
    Retourne la liste des défis actifs pour un utilisateur.
    Version robuste :
    - Si les tables 'challenge_instances' et 'challenges' existent → OK.
    - Si l'une des deux tables n'existe pas → renvoie [] sans planter.
    """

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
        WHERE ci.target_type = 'user'
          AND ci.target_id = :user_id
          AND ci.status = 'en_cours'
        ORDER BY ci.created_at DESC
    """)

    try:
        rows = db.execute(sql, {"user_id": user_id}).mappings().all()
    except Exception as e:
        print("[A54][WARN] Impossible de charger les défis actifs (table manquante ?) → retour []. Détail :", e)
        return []

    # Construction du modèle Pydantic
    results = []
    for r in rows:
        results.append(
            ChallengeInstanceRead(
                instance_id=r["instance_id"],
                challenge_id=r["challenge_id"],
                code=r["code"],
                name=r["name"],
                description=r["description"],
                metric=r["metric"],
                logic_type=r["logic_type"],
                period_type=r["period_type"],
                status=r["status"],
                start_date=r["start_date"],
                end_date=r["end_date"],
                reference_value=r["reference_value"],
                current_value=r["current_value"],
                target_value=r["target_value"],
                progress_percent=r["progress_percent"],
                created_at=r["created_at"],
                last_evaluated_at=r["last_evaluated_at"],
            )
        )

    return results





# ---------- 4) Réévaluer un défi pour un utilisateur ---------- #

@router.post(
    "/users/{user_id}/challenges/{instance_id}/evaluate",
    response_model=ChallengeEvaluateResponse,
)
def evaluate_challenge(
    user_id: int,
    instance_id: int,
    db: Session = Depends(get_db),
):
    """
    Réévalue un défi (recalcule la progression et le statut) pour un utilisateur.
    Version A54.19 : prise en charge du défi CO2 30 jours (CO2_30D_MINUS_10).
    """

    now = datetime.utcnow()

    # 1) Récupérer l'instance + le défi associé
    select_sql = text(
        """
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
          AND ci.target_type = 'user'
          AND ci.target_id = :user_id
        """
    )

    row = db.execute(
        select_sql,
        {"instance_id": instance_id, "user_id": user_id},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Instance de défi introuvable pour cet utilisateur.")

    # Vérifier qu'on est bien sur le défi CO2 30 jours
    if not (
        row["metric"] == "co2"
        and row["logic_type"] == "reduction_relative"
        and row["period_type"] == "30_jours_glissants"
    ):
        raise HTTPException(
            status_code=400,
            detail="Ce type de défi n'est pas encore pris en charge par l'évaluation."
        )

    # 2) Convertir les dates stockées (ISO texte) en datetime
    try:
        start_date = datetime.fromisoformat(row["start_date"])
        end_date = datetime.fromisoformat(row["end_date"])
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Format de date invalide dans l'instance de défi."
        )

    # Périodes de calcul
    # Période de référence: 30 jours AVANT le début du défi
    periode_ref_fin = start_date
    periode_ref_debut = start_date - timedelta(days=30)

    # Période actuelle: pendant le défi (limitée à now ou end_date)
    periode_actuelle_debut = start_date
    periode_actuelle_fin = end_date if now > end_date else now

    # 3) Calcul des valeurs CO2 depuis l'historique des paniers
    # NOTE : adapte "cart_history", "date" et "co2_total" aux noms de ta base si nécessaire.
       # 3) Calcul des valeurs CO2 depuis l'historique des paniers
    # On utilise la table réelle: co2_cart_history
    # - total_co2_g : CO2 en grammes
    # - created_at  : date de création de l'agrégat
    ref_sql = text(
        """
        SELECT SUM(total_co2_g) AS total_co2_g
        FROM co2_cart_history
        WHERE user_id = :user_id
          AND created_at >= :start
          AND created_at < :end
        """
    )

    cur_sql = text(
        """
        SELECT SUM(total_co2_g) AS total_co2_g
        FROM co2_cart_history
        WHERE user_id = :user_id
          AND created_at >= :start
          AND created_at <= :end
        """
    )

    # NOTE : user_id est TEXT dans co2_cart_history, on convertit donc en str
    ref_row = db.execute(
        ref_sql,
        {
            "user_id": str(user_id),
            "start": periode_ref_debut.isoformat(),
            "end": periode_ref_fin.isoformat(),
        },
    ).mappings().first()

    cur_row = db.execute(
        cur_sql,
        {
            "user_id": str(user_id),
            "start": periode_actuelle_debut.isoformat(),
            "end": periode_actuelle_fin.isoformat(),
        },
    ).mappings().first()

    # Conversion en kg CO2 pour le défi
    if ref_row["total_co2_g"] is not None:
        reference_value = float(ref_row["total_co2_g"]) / 1000.0
    else:
        reference_value = None

    if cur_row["total_co2_g"] is not None:
        current_value = float(cur_row["total_co2_g"]) / 1000.0
    else:
        current_value = 0.0


    target_value = float(row["target_value"]) if row["target_value"] is not None else 0.10

    # 4) Calcul de la réduction et de la progression
    progress_percent: float | None = None
    status = row["status"]
    message = ""

    if reference_value is None or reference_value <= 0:
        # Pas assez d'historique pour calculer une réduction
        if now < end_date:
            status = "en_cours"
            progress_percent = None
            message = (
                "Pas encore assez d'historique CO₂ pour évaluer ce défi. "
                "Continue à scanner des produits."
            )
        else:
            status = "expire"
            progress_percent = None
            message = (
                "Le défi est terminé mais il n'y avait pas assez d'historique CO₂ "
                "pour calculer une réduction."
            )
    else:
        # Il y a une référence, on peut calculer la réduction
        reduction = 1.0 - (current_value / reference_value) if reference_value > 0 else 0.0

        # Progression par rapport à l'objectif (target_value = 0.10 pour 10%)
        if target_value > 0:
            progress_percent = (reduction / target_value) * 100.0
        else:
            progress_percent = None

        # On peut borner pour l'affichage si tu veux rester à 0–100
        if progress_percent is not None:
            if progress_percent < 0:
                progress_percent = 0.0
            # On pourrait laisser > 100 pour montrer qu'il a dépassé l'objectif,
            # mais pour un affichage simple on peut limiter à 100.
            if progress_percent > 100:
                progress_percent = 100.0

        # Détermination du statut
        if reduction >= target_value:
            # Objectif atteint
            status = "reussi"
            if now < end_date:
                message = (
                    "Bravo ! Tu as déjà atteint ton objectif de réduction de CO₂ 🎉"
                )
            else:
                message = (
                    "Bravo ! Tu as réussi ton défi de réduction de CO₂ sur 30 jours 🎉"
                )
        else:
            # Objectif pas encore atteint
            if now < end_date:
                status = "en_cours"
                message = (
                    f"Tu as réduit ton CO₂ de {reduction * 100:.1f} %, "
                    f"objectif : {target_value * 100:.0f} %. Continue !"
                )
            else:
                status = "echoue"
                message = (
                    f"Le défi est terminé. Tu as réduit ton CO₂ de {reduction * 100:.1f} %, "
                    f"mais l'objectif était {target_value * 100:.0f} %. Tu peux retenter un nouveau défi."
                )

    # 5) Mise à jour de l'instance dans la base
    update_sql = text(
        """
        UPDATE challenge_instances
        SET
            reference_value = :reference_value,
            current_value = :current_value,
            target_value = :target_value,
            progress_percent = :progress_percent,
            status = :status,
            last_evaluated_at = :last_evaluated_at
        WHERE id = :instance_id
        """
    )

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

    # 6) Construire la réponse Pydantic
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

