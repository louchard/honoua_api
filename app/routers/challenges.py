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
                    COALESCE(metric, 'CO2') AS metric,
                    COALESCE(logic_type, 'REDUCTION_PCT') AS logic_type,
                    COALESCE(period_type, 'DAYS') AS period_type,
                    COALESCE(default_target_value, target_reduction_pct, 0)::float AS default_target_value,
                    COALESCE(scope_type, 'CART') AS scope_type,
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
    # 1) Charger le challenge (Postgres-friendly, champs non nuls)
    challenge_row = db.execute(
        text("""
            SELECT
                id,
                code,
                COALESCE(name, title, code) AS name,
                description,
                COALESCE(metric, 'CO2') AS metric,
                COALESCE(logic_type, 'REDUCTION_PCT') AS logic_type,
                COALESCE(period_type, 'DAYS') AS period_type,
                COALESCE(default_target_value, target_reduction_pct, 0)::float AS default_target_value,
                COALESCE(scope_type, 'CART') AS scope_type,
                COALESCE(active, is_active, TRUE) AS active,
                COALESCE(period_days, 30) AS period_days
            FROM public.challenges
            WHERE id = :challenge_id
              AND COALESCE(active, is_active, TRUE) = TRUE
            LIMIT 1
        """),
        {"challenge_id": payload.challenge_id},
    ).mappings().first()

    if challenge_row is None:
        raise HTTPException(status_code=404, detail="Défi introuvable ou inactif.")

    # 2) Calcul period_start / period_end (schema prod)
    today = datetime.utcnow().date()
    period_days = int(challenge_row.get("period_days") or 30)
    period_start = today
    period_end = today + timedelta(days=period_days)

    # 3) Insérer l'instance (schema prod)
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
            "challenge_id": int(challenge_row["id"]),
            "user_id": str(user_id),
            "period_start": period_start,
            "period_end": period_end,
        },
    )

    instance_id = result.scalar_one()
    db.commit()

    # 4) Relire et retourner une réponse compatible avec ChallengeInstanceRead
    row = db.execute(
        text("""
            SELECT
                ci.id AS instance_id,
                ci.challenge_id,
                c.code,
                COALESCE(c.name, c.title, c.code) AS name,
                c.description,
                COALESCE(c.metric, 'CO2') AS metric,
                COALESCE(c.logic_type, 'REDUCTION_PCT') AS logic_type,
                COALESCE(c.period_type, 'DAYS') AS period_type,
                ci.status,
                ci.period_start AS start_date,
                ci.period_end   AS end_date,
                NULL::numeric   AS reference_value,
                NULL::numeric   AS current_value,
                COALESCE(c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value,
                NULL::numeric   AS progress_percent,
                ci.created_at,
                NULL::timestamp AS last_evaluated_at
            FROM public.challenge_instances ci
            JOIN public.challenges c ON c.id = ci.challenge_id
            WHERE ci.id = :instance_id
            LIMIT 1
        """),
        {"instance_id": instance_id},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de l'instance de défi.")

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
                COALESCE(c.name, c.title, c.code) AS name,
                c.description,
                c.metric,
                c.logic_type,
                c.period_type,
                ci.status,
                ci.period_start AS start_date,
                ci.period_end   AS end_date,
                NULL::numeric   AS reference_value,
                NULL::numeric   AS current_value,
                COALESCE(c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value,
                NULL::numeric   AS progress_percent,
                ci.created_at,
                NULL::timestamp AS last_evaluated_at
            FROM public.challenge_instances ci
            JOIN public.challenges c ON c.id = ci.challenge_id
            WHERE ci.user_id::text = :user_id
              AND UPPER(ci.status) IN ('ACTIVE', 'EN_COURS')
            ORDER BY ci.created_at DESC
        """)


    try:
        rows = db.execute(sql, {"user_id": str(user_id)}).mappings().all()
    except Exception as e:
        print("[A54][WARN] Impossible de charger les défis actifs (table manquante ?) → retour []. Détail :", e)
        return []

    # Construction du modèle Pydantic
    results = []
    for r in rows:
        data = dict(r)

        # --- Defaults pour éviter les ValidationError Pydantic ---
        if data.get("metric") is None:
            data["metric"] = "CO2"
        if data.get("logic_type") is None:
            data["logic_type"] = "REDUCTION_PCT"
        if data.get("period_type") is None:
            data["period_type"] = "DAYS"
        if data.get("name") is None:
            data["name"] = data.get("code") or "CHALLENGE"

        # --- Normalisation dates (date -> datetime à minuit) ---
        sd = data.get("start_date")
        if sd is not None and not isinstance(sd, datetime) and hasattr(sd, "year"):
            data["start_date"] = datetime.combine(sd, datetime.min.time())

        ed = data.get("end_date")
        if ed is not None and not isinstance(ed, datetime) and hasattr(ed, "year"):
            data["end_date"] = datetime.combine(ed, datetime.min.time())

        try:
            results.append(ChallengeInstanceRead(**data))
        except Exception as e:
            print("[A54][WARN] Row invalide dans /challenges/active (skip). Détail :", e)
            continue

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
            ci.user_id,
            ci.period_start AS start_date,
            ci.period_end   AS end_date,
            ci.status,
            ci.created_at,
            ci.updated_at,
            c.code,
            COALESCE(c.name, c.title, c.code) AS name,
            COALESCE(c.metric, 'CO2') AS metric,
            COALESCE(c.logic_type, 'REDUCTION_PCT') AS logic_type,
            COALESCE(c.period_type, 'DAYS') AS period_type,
            COALESCE(c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value
        FROM public.challenge_instances ci
        JOIN public.challenges c ON c.id = ci.challenge_id
        WHERE ci.id = :instance_id
          AND ci.user_id::text = :user_id
        """
    )

    row = db.execute(
        select_sql,
        {"instance_id": instance_id, "user_id": str(user_id)},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Instance de défi introuvable pour cet utilisateur.")

    # Vérifier qu'on est bien sur le défi CO2 30 jours
        # Vérifier qu'on est bien sur le défi supporté (prod)

    if (row.get("code") or "").upper() != "CO2_30D_MINUS_10":
        raise HTTPException(
            status_code=400,
            detail="Ce type de défi n'est pas encore pris en charge par l'évaluation."
        )

           

    # 2) Convertir les dates stockées (ISO texte) en datetime
    # 2) Convertir / normaliser les dates (prod): period_start/period_end -> start_date/end_date
    try:
        start_raw = row["start_date"]
        end_raw = row["end_date"]

        # start_date
        if isinstance(start_raw, datetime):
            start_date = start_raw
        elif isinstance(start_raw, str):
            start_date = datetime.fromisoformat(start_raw)
        else:
            # date (ou objet date-like)
            start_date = datetime.combine(start_raw, datetime.min.time())

        # end_date
        if isinstance(end_raw, datetime):
            end_date = end_raw
        elif isinstance(end_raw, str):
            end_date = datetime.fromisoformat(end_raw)
        else:
            end_date = datetime.combine(end_raw, datetime.min.time())

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

    # 5) Mise à jour de l'instance dans la base (tolérant au schéma prod)
    full_update_sql = text(
        """
        UPDATE public.challenge_instances
        SET
            reference_value = :reference_value,
            current_value = :current_value,
            target_value = :target_value,
            progress_percent = :progress_percent,
            status = :status,
            last_evaluated_at = :last_evaluated_at,
            updated_at = NOW()
        WHERE id = :instance_id
        """
    )

    fallback_update_sql = text(
        """
        UPDATE public.challenge_instances
        SET
            status = :status,
            updated_at = NOW()
        WHERE id = :instance_id
        """
    )

    try:
        db.execute(
            full_update_sql,
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

    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        print("[A54][WARN] UPDATE complet impossible (schéma prod différent ?) -> fallback. Détail :", e)

        try:
            db.execute(
                fallback_update_sql,
                {"status": status, "instance_id": instance_id},
            )
            db.commit()
        except Exception as e2:
            db.rollback()
            print("[A54][WARN] UPDATE fallback impossible -> on renvoie quand même la réponse. Détail :", e2)

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
