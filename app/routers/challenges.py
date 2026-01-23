from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import calendar
from sqlalchemy import bindparam
from sqlalchemy import text, bindparam
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


# ---------- 1) Lister les dÃ©fis disponibles ---------- #
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


# ---------- 2) Activer un dÃ©fi pour un utilisateur ---------- #

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
    Idempotence + nettoyage :
    - Si une instance ACTIVE/en_cours existe déjà pour (user_id, challenge_id) :
        * on conserve la plus récente
        * on SUPPRIME les doublons (DELETE) pour rester compatible avec chk_challenge_instances_status
        * on ne recrée pas
    - Sinon : on crée une nouvelle instance.
    """
    user_id_str = str(user_id)
    challenge_id = int(payload.challenge_id)
    now = datetime.utcnow()
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Verrou transactionnel : empêche deux activations concurrentes du même (user_id, challenge_id)
    db.execute(
        text("SELECT pg_advisory_xact_lock(:uid, :cid)"),
        {"uid": user_id, "cid": challenge_id},
    )

    # SQL commun pour retourner une instance au format ChallengeInstanceRead
    select_instance_sql = text(
        """
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
            NULL::numeric AS reference_value,
            NULL::numeric AS current_value,
            COALESCE(ci.target_value, c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value,
            NULL::numeric AS progress_percent,
            NULL::timestamp AS last_evaluated_at,
            ci.created_at
        FROM public.challenge_instances ci
        JOIN public.challenges c ON c.id = ci.challenge_id
        WHERE ci.id = :instance_id
          AND ci.user_id::text = :user_id
        """
    )

    # 1) Verrouiller et récupérer les instances actives (si doublons)
    existing_ids_sql = text(
        """
        SELECT ci.id
        FROM public.challenge_instances ci
        WHERE ci.user_id::text = :user_id
          AND ci.challenge_id = :challenge_id
          AND (UPPER(ci.status) = 'ACTIVE' OR ci.status = 'en_cours')
        ORDER BY ci.created_at DESC, ci.id DESC
        FOR UPDATE
        """
    )

    try:
        existing_rows = db.execute(
            existing_ids_sql,
            {"user_id": user_id_str, "challenge_id": challenge_id},
        ).mappings().all()

        # 1bis) Si existe : garder la plus récente + supprimer les doublons
        if existing_rows:
            keep_id = existing_rows[0]["id"]
            old_ids = [r["id"] for r in existing_rows[1:]]

            if old_ids:
                cleanup_sql = (
                    text(
                        """
                        DELETE FROM public.challenge_instances
                        WHERE id IN :old_ids
                        """
                    ).bindparams(bindparam("old_ids", expanding=True))
                )
                db.execute(cleanup_sql, {"old_ids": old_ids})

            db.commit()

            row = db.execute(
                select_instance_sql,
                {"instance_id": keep_id, "user_id": user_id_str},
            ).mappings().first()

            if row is None:
                raise HTTPException(status_code=404, detail="Instance introuvable après nettoyage.")

            return ChallengeInstanceRead(**row)

        # 2) Sinon : créer une nouvelle instance
        start_date = today0
        end_date = today0 + timedelta(days=30)

        insert_sql = text(
            """
            INSERT INTO public.challenge_instances (
                user_id,
                challenge_id,
                status,
                period_start,
                period_end,
                created_at,
                updated_at,
                target_value
            )
            VALUES (
                :user_id,
                :challenge_id,
                'ACTIVE',
                :start_date,
                :end_date,
                :now,
                :now,
                COALESCE(
                    (SELECT default_target_value FROM public.challenges WHERE id = :challenge_id),
                    0
                )
            )
            RETURNING id
            """
        )

        new_id = db.execute(
            insert_sql,
            {
                "user_id": user_id,
                "challenge_id": challenge_id,
                "start_date": start_date,
                "end_date": end_date,
                "now": now,
            },
        ).scalar()

        db.commit()

        row = db.execute(
            select_instance_sql,
            {"instance_id": new_id, "user_id": user_id_str},
        ).mappings().first()

        if row is None:
            raise HTTPException(status_code=404, detail="Instance créée mais introuvable.")

        return ChallengeInstanceRead(**row)

    except Exception:
        db.rollback()
        raise

<<<<<<< HEAD
# ---------- 3) Lister les défis actifs d'un utilisateur ---------- #
=======
# ---------- 3) Lister les dÃ©fis actifs d'un utilisateur ---------- #
>>>>>>> ba96078 (Fix: activate_challenge idempotent (delete duplicate active instances))

@router.get(
    "/users/{user_id}/challenges/active",
    response_model=list[ChallengeInstanceRead],
)
def get_active_challenges(
    user_id: int,
    db: Session = Depends(get_db),
):
    """
    Retourne la liste des dÃ©fis actifs pour un utilisateur.
    Version robuste :
    - Si les tables 'challenge_instances' et 'challenges' existent â†’ OK.
    - Si l'une des deux tables n'existe pas â†’ renvoie [] sans planter.
    """

# SELECT complet (si le schÃ©ma prod contient reference_value/current_value/progress_percent/last_evaluated_at)
    sql = text("""
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
        WHERE ci.user_id::text = :user_id
          AND (UPPER(ci.status) = 'ACTIVE' OR ci.status = 'en_cours')
        ORDER BY ci.created_at DESC
    """)

    try:
        rows = db.execute(sql, {"user_id": str(user_id)}).mappings().all()
    except Exception as e:
        print("[A54][WARN] /challenges/active SQL KO -> retour []. DÃ©tail :", e)
        return []

    results = []
    for r in rows:
        data = dict(r)

        # SÃ©curiser les champs string (Ã©vite crash Pydantic si NULL)
        data["metric"] = data.get("metric") or "CO2"
        data["logic_type"] = data.get("logic_type") or "REDUCTION_PCT"
        data["period_type"] = data.get("period_type") or "DAYS"

        try:
            results.append(ChallengeInstanceRead(**data))
        except Exception as e:
            print("[A54][WARN] Row invalide dans /challenges/active (skip). DÃ©tail :", e)
            continue

    return results

    return results


# ---------- 4) RÃ©Ã©valuer un dÃ©fi pour un utilisateur ---------- #

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
    RÃ©Ã©value un dÃ©fi (recalcule la progression et le statut) pour un utilisateur.
    Version A54.19 : prise en charge du dÃ©fi CO2 30 jours (CO2_30D_MINUS_10).
    """

    now = datetime.utcnow()

    # 1) RÃ©cupÃ©rer l'instance + le dÃ©fi associÃ©
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
        raise HTTPException(status_code=404, detail="Instance de dÃ©fi introuvable pour cet utilisateur.")

    # VÃ©rifier qu'on est bien sur le dÃ©fi CO2 30 jours
        # VÃ©rifier qu'on est bien sur le dÃ©fi supportÃ© (prod)

    if (row.get("code") or "").upper() != "CO2_30D_MINUS_10":
        raise HTTPException(
            status_code=400,
            detail="Ce type de dÃ©fi n'est pas encore pris en charge par l'Ã©valuation."
        )

           

    # 2) Convertir les dates stockÃ©es (ISO texte) en datetime
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
            detail="Format de date invalide dans l'instance de dÃ©fi."
        )


    # PÃ©riodes de calcul
    # PÃ©riode de rÃ©fÃ©rence: 30 jours AVANT le dÃ©but du dÃ©fi
    periode_ref_fin = start_date
    periode_ref_debut = start_date - timedelta(days=30)

    # PÃ©riode actuelle: pendant le dÃ©fi (limitÃ©e Ã  now ou end_date)
    periode_actuelle_debut = start_date
    periode_actuelle_fin = end_date if now > end_date else now

    # 3) Calcul des valeurs CO2 depuis l'historique des paniers
    # NOTE : adapte "cart_history", "date" et "co2_total" aux noms de ta base si nÃ©cessaire.
       # 3) Calcul des valeurs CO2 depuis l'historique des paniers
    # On utilise la table rÃ©elle: co2_cart_history
    # - total_co2_g : CO2 en grammes
    # - created_at  : date de crÃ©ation de l'agrÃ©gat
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

    # Conversion en kg CO2 pour le dÃ©fi
    if ref_row["total_co2_g"] is not None:
        reference_value = float(ref_row["total_co2_g"]) / 1000.0
    else:
        reference_value = None

    if cur_row["total_co2_g"] is not None:
        current_value = float(cur_row["total_co2_g"]) / 1000.0
    else:
        current_value = 0.0

        # target_value est stockÃ© en "pourcentage" cÃ´tÃ© dÃ©fi (ex: 10.0 pour 10%)
    target_value = float(row["target_value"]) if row.get("target_value") is not None else 10.0

    # Valeur utilisable pour les calculs (fraction: 0.10 pour 10%)
    target_value_pct = (target_value / 100.0) if target_value > 1 else target_value


    # 4) Calcul de la rÃ©duction et de la progression
    progress_percent: float | None = None
    status = row["status"]
    message = ""

    if reference_value is None or reference_value <= 0:
        # Pas assez d'historique pour calculer une rÃ©duction
        if now < end_date:
            status = "en_cours"
            progress_percent = None
            message = (
                "Pas encore assez d'historique COâ‚‚ pour Ã©valuer ce dÃ©fi. "
                "Continue Ã  scanner des produits."
            )
        else:
            status = "expire"
            progress_percent = None
            message = (
                "Le dÃ©fi est terminÃ© mais il n'y avait pas assez d'historique COâ‚‚ "
                "pour calculer une rÃ©duction."
            )
    else:
        # Il y a une rÃ©fÃ©rence, on peut calculer la rÃ©duction
        reduction = 1.0 - (current_value / reference_value) if reference_value > 0 else 0.0

        # Progression par rapport Ã  l'objectif (target_value = 0.10 pour 10%)
        if target_value > 0:
            progress_percent = (reduction / target_value) * 100.0
        else:
            progress_percent = None

        # On peut borner pour l'affichage si tu veux rester Ã  0â€“100
        if progress_percent is not None:
            if progress_percent < 0:
                progress_percent = 0.0
            # On pourrait laisser > 100 pour montrer qu'il a dÃ©passÃ© l'objectif,
            # mais pour un affichage simple on peut limiter Ã  100.
            if progress_percent > 100:
                progress_percent = 100.0

        # DÃ©termination du statut
        if reduction >= target_value:
            # Objectif atteint
            status = "reussi"
            if now < end_date:
                message = (
                    "Bravo ! Tu as dÃ©jÃ  atteint ton objectif de rÃ©duction de COâ‚‚ ðŸŽ‰"
                )
            else:
                message = (
                    "Bravo ! Tu as rÃ©ussi ton dÃ©fi de rÃ©duction de COâ‚‚ sur 30 jours ðŸŽ‰"
                )
        else:
            # Objectif pas encore atteint
            if now < end_date:
                status = "en_cours"
                message = (
                    f"Tu as rÃ©duit ton COâ‚‚ de {reduction * 100:.1f} %, "
                    f"objectif : {target_value * 100:.0f} %. Continue !"
                )
            else:
                status = "echoue"
                message = (
                    f"Le dÃ©fi est terminÃ©. Tu as rÃ©duit ton COâ‚‚ de {reduction * 100:.1f} %, "
                    f"mais l'objectif Ã©tait {target_value * 100:.0f} %. Tu peux retenter un nouveau dÃ©fi."
                )

    # 5) Mise Ã  jour de l'instance dans la base (tolÃ©rant au schÃ©ma prod)
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
        print("[A54][WARN] UPDATE complet impossible (schÃ©ma prod diffÃ©rent ?) -> fallback. DÃ©tail :", e)

        try:
            db.execute(
                fallback_update_sql,
                {"status": status, "instance_id": instance_id},
            )
            db.commit()
        except Exception as e2:
            db.rollback()
            print("[A54][WARN] UPDATE fallback impossible -> on renvoie quand mÃªme la rÃ©ponse. DÃ©tail :", e2)

    # 6) Construire la rÃ©ponse Pydantic
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
