from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import calendar

from sqlalchemy import bindparam
from sqlalchemy import text, bindparam
from sqlalchemy.exc import OperationalError, ProgrammingError

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

# --- Challenge status mapping (DB <-> API) ---
DB_STATUS_ACTIVE = "ACTIVE"
DB_STATUS_SUCCESS = "SUCCESS"
DB_STATUS_FAILED = "FAILED"

API_STATUS_MAP = {
    DB_STATUS_ACTIVE: "en_cours",
    DB_STATUS_SUCCESS: "reussi",
    DB_STATUS_FAILED: "echoue",
}

def to_api_status(db_status: str) -> str:
    return API_STATUS_MAP.get((db_status or "").upper(), (db_status or ""))

def to_db_status(db_status: str) -> str:
    # hard-normalize to allowed DB values
    s = (db_status or "").upper()
    if s in (DB_STATUS_ACTIVE, DB_STATUS_SUCCESS, DB_STATUS_FAILED):
        return s
    # fallback: treat unknown as ACTIVE to avoid CHECK violations
    return DB_STATUS_ACTIVE

def repair_mojibake(s: str) -> str:
    """
    Répare les cas typiques: UTF-8 décodé comme Latin-1 (ex: 'A\xa0' au lieu de 'à').
    Safe: ne fait rien si aucun marqueur n'est présent.
    """
    if not s:
        return s

    markers = ("A", "A", "O", "\ufffd")
    if not any(m in s for m in markers):
        return s

    try:
        return s.encode("latin-1").decode("utf-8")
    except UnicodeError:
        # Fallback minimal: remplace NBSP si présent
        return s.replace("\u00A0", " ")

# ---------- 1) Lister les défis disponibles ---------- #
@router.get("/challenges", response_model=list[ChallengeRead])
def list_challenges(db: Session = Depends(get_db)):


    """
    Retourne la liste des défis disponibles (catalogue).
    Robuste : en cas de mismatch de schéma (colonne/table), renvoie [] au lieu de 500.
    """

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
                    metric,
                    logic_type,
                    period_type,
                    default_target_value,
                    COALESCE(scope_type, score_type) AS scope_type,
                    COALESCE(active, is_active, TRUE) AS active
                FROM public.challenges
                WHERE COALESCE(active, is_active, TRUE) = TRUE
                ORDER BY id ASC
            """)


        ).mappings().all()

        return [dict(r) for r in rows]

    except (OperationalError, ProgrammingError) as e:
        # Fallback schema-safe: only columns very likely to exist.
        print("[A54][WARN] /challenges list schema mismatch:", e)

        rows = db.execute(
            text("""
                SELECT
                    id,
                    code,
                    COALESCE(name, code) AS name,
                    'CO2' AS metric,
                    'REDUCTION_PCT' AS logic_type,
                    'DAYS' AS period_type,
                    0::float AS default_target_value,
                    'CART' AS scope_type,
                    TRUE AS active
                FROM public.challenges
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
    Idempotence + nettoyage :
    - Si une instance ACTIVE/en_cours existe déjà  pour (user_id, challenge_id) :
        * on conserve la plus récente
        * on SUPPRIME les doublons (DELETE) pour rester compatible avec chk_challenge_instances_status
        * on ne recrée pas
    - Sinon : on crée une nouvelle instance.
    """
    user_id_str = str(user_id)
    user_id_uuid = f"00000000-0000-0000-0000-{user_id:012d}"
    params = {"user_id_str": user_id_str, "user_id_uuid": user_id_uuid}

    challenge_id = int(payload.challenge_id)
    now = datetime.utcnow()
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)

    try:
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
                COALESCE(c.name, c.code) AS name,
                c.description,
                'CO2' AS metric,
                'REDUCTION_PCT' AS logic_type,
                'DAYS' AS period_type,
                ci.status,
                COALESCE(ci.period_start, ci.created_at, NOW()) AS start_date,
                COALESCE(ci.period_end,   ci.created_at, NOW()) AS end_date,
                NULL::numeric   AS reference_value,
                NULL::numeric   AS current_value,
                COALESCE(c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value,
                NULL::numeric   AS progress_percent,
                NULL::timestamp AS last_evaluated_at,
                NULL::text      AS message,
                COALESCE(ci.created_at, NOW()) AS created_at
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
            WHERE ci.user_id::text IN (:user_id_str, :user_id_uuid)
              AND ci.challenge_id = :challenge_id
              AND TRIM(UPPER(ci.status)) NOT IN ('SUCCESS','FAILED')
            ORDER BY ci.id DESC
            LIMIT 20
            FOR UPDATE
            """
        )

        existing_rows = db.execute(
        existing_ids_sql,
        dict(params, challenge_id=challenge_id),
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
                raise HTTPException(status_code=404, detail="Instance introuvable aprés nettoyage.")

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
                updated_at
                
            )
            VALUES (
                :user_id,
                :challenge_id,
                'ACTIVE',
                :start_date,
                :end_date,
                :now,
                :now
            )
            RETURNING id
            """
        )

        new_id = db.execute(
            insert_sql,
            {
                "user_id": user_id_str,
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


# ---------- 3) Lister les défis actifs d'un utilisateur ---------- #
# ---------- 3) Lister les défis actifs d'un utilisateur ---------- #
@router.get(
    "/users/{user_id}/challenges/active",
    response_model=list[ChallengeInstanceRead],
)
def get_active_challenges(
    user_id: int,
    response: Response = None,
    db: Session = Depends(get_db),
):
    """
    Return active challenges for a user (prod-safe).
    - No dependency on optional columns (message, reference_value, current_value...)
    - Avoid text=int comparison on user_id
    """
    if response is not None:
        response.headers["X-Honoua-Active-Version"] = "A54.21"
        response.headers["Cache-Control"] = "no-store"

    user_id_str = str(user_id)
    user_id_uuid = f"00000000-0000-0000-0000-{user_id:012d}"
    params = {"user_id_str": user_id_str, "user_id_uuid": user_id_uuid}

    # ⚠️ Ne référence aucune colonne optionnelle dans challenge_instances
    sql_min = text("""
        SELECT
            ci.id AS instance_id,
            ci.challenge_id,
            c.code,
            COALESCE(c.name, c.code) AS name,

            NULL::text AS description,
            'CO2'::text AS metric,
            'REDUCTION_PCT'::text AS logic_type,
            'DAYS'::text AS period_type,

            ci.status,

            -- ⚠️ prod-safe : pas de ci.period_start / ci.period_end
            COALESCE(ci.period_start, ci.created_at, NOW()) AS start_date,
            COALESCE(ci.period_end,   ci.created_at, NOW()) AS end_date,

            NULL::numeric   AS reference_value,
            NULL::numeric   AS current_value,

            COALESCE(c.default_target_value, c.target_reduction_pct, 0)::numeric AS target_value,

            NULL::numeric   AS progress_percent,
            NULL::timestamp AS last_evaluated_at,
            NULL::text      AS message,

            COALESCE(ci.created_at, NOW()) AS created_at
        FROM public.challenge_instances ci
        JOIN public.challenges c ON c.id = ci.challenge_id
        WHERE ci.user_id::text IN (:user_id_str, :user_id_uuid)
          AND TRIM(UPPER(ci.status)) NOT IN ('SUCCESS','FAILED')
        ORDER BY ci.id DESC
        LIMIT 20
    """)

    try:
        rows = db.execute(sql_min, params).mappings().all()
    except Exception as e:
        # Important: après une erreur SQL, la transaction peut être "aborted"
        try:
            rb = getattr(db, "rollback", None)
            if callable(rb):
                rb()
        except Exception:
            pass

        print("[A54][WARN] /challenges/active SQL KO -> return []. Detail:", e)

        if response is not None:
            response.headers["X-Honoua-Active-Query"] = "min"
            response.headers["X-Honoua-Active-Rows"] = "0"
            response.headers["X-Honoua-Active-Err1"] = err1
        return []

    if response is not None:
        response.headers["X-Honoua-Active-Query"] = "min"
        response.headers["X-Honoua-Active-Rows"] = str(len(rows))

    results = []
    for r in rows:
        data = dict(r)
        data["status"] = to_api_status(to_db_status(data.get("status") or ""))
        results.append(ChallengeInstanceRead(**data))

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
            COALESCE(ci.period_start, ci.created_at, NOW()) AS start_date,
            COALESCE(ci.period_end,   ci.created_at, NOW()) AS end_date,
            ci.status,
            COALESCE(ci.created_at, NOW()) AS created_at
            ci.updated_at,
            c.code,
            COALESCE(c.name, c.code) AS name,
            'CO2' AS metric,
            'REDUCTION_PCT' AS logic_type,
            'DAYS' AS period_type,
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

    # Période actuelle: pendant le défi (limitée à  now ou end_date)
    periode_actuelle_debut = start_date
    periode_actuelle_fin = end_date if now > end_date else now

    # 3) Calcul des valeurs CO2 depuis l'historique des paniers (co2_cart_history)
    # - total_co2_g : CO2 en grammes
    # - created_at  : date de création de l'agrégat
    ref_sql = text(
        """
        SELECT
            SUM(total_co2_g) AS total_co2_g,
            COUNT(DISTINCT DATE(created_at)) AS days_count
        FROM co2_cart_history
        WHERE user_id = :user_id
          AND created_at >= :start
          AND created_at < :end
        """
    )

    cur_sql = text(
        """
        SELECT
            SUM(total_co2_g) AS total_co2_g,
            COUNT(DISTINCT DATE(created_at)) AS days_count
        FROM co2_cart_history
        WHERE user_id = :user_id
          AND created_at >= :start
          AND created_at <= :end
        """
    )

    # NOTE: user_id est TEXT dans co2_cart_history -> str(user_id)
    ref_row = db.execute(
        ref_sql,
        {
            "user_id": str(user_id),
            "start": periode_ref_debut,
            "end": periode_ref_fin,
        },
    ).mappings().first() or {}

    cur_row = db.execute(
        cur_sql,
        {
            "user_id": str(user_id),
            "start": periode_actuelle_debut,
            "end": periode_actuelle_fin,
        },
    ).mappings().first() or {}

    # Conversion en kg CO2 pour le défi
    reference_value = float(ref_row["total_co2_g"]) / 1000.0 if ref_row.get("total_co2_g") is not None else None
    current_value = float(cur_row["total_co2_g"]) / 1000.0 if cur_row.get("total_co2_g") is not None else 0.0

    # Seuils d'historique
    ref_days = int(ref_row.get("days_count") or 0)
    cur_days = int(cur_row.get("days_count") or 0)

    MIN_REF_DAYS = 7
    MIN_CUR_DAYS = 1

    has_ref = (reference_value is not None) and (reference_value > 0) and (ref_days >= MIN_REF_DAYS)
    has_cur = (cur_days >= MIN_CUR_DAYS)

    # target_value est stocké en "pourcentage" pour le défi (ex: 10.0 pour 10%)
    target_value = float(row["target_value"]) if row.get("target_value") is not None else 10.0

    # Valeur utilisable pour les calculs (fraction: 0.10 pour 10%)
    target_value_pct = (target_value / 100.0) if target_value > 1 else target_value


    # 4) Calcul de la réduction et de la progression
    progress_percent: float | None = None

    # Statuts : DB (strict) vs API (FR)
    db_status = to_db_status(row.get("status"))
    api_status = to_api_status(db_status)
    message = ""

    # Cas: pas encore de donnees pendant le defi
    if not has_cur:
        if now < end_date:
            db_status = DB_STATUS_ACTIVE
        else:
            db_status = DB_STATUS_FAILED
        api_status = to_api_status(db_status)
        progress_percent = None
        message = "Pas encore de donnees CO2 sur la periode du defi. Commence a scanner des produits."

# 5) Cas: pas assez d'historique AVANT le debut (reference)
    elif not has_ref:
        if now < end_date:
            db_status = DB_STATUS_ACTIVE
        else:
            db_status = DB_STATUS_FAILED
        api_status = to_api_status(db_status)
        progress_percent = None
        message = "Pas assez d'historique CO2 avant le debut du defi (min 7 jours). Continue a scanner."

# 6) Cas nominal: on calcule reduction + progression
    else:
        reduction = 1.0 - (current_value / reference_value) if reference_value > 0 else 0.0

        if target_value_pct > 0:
            progress_percent = (reduction / target_value_pct) * 100.0
        else:
            progress_percent = None

        if progress_percent is not None:
            if progress_percent < 0:
                progress_percent = 0.0
            if progress_percent > 100:
                progress_percent = 100.0

        if reduction >= target_value_pct:
            db_status = DB_STATUS_SUCCESS
            api_status = to_api_status(db_status)
            message = "Bravo ! Objectif deja atteint." if now < end_date else "Bravo ! Defi reussi sur 30 jours."
        else:
            # Pas encore atteint
            db_status = DB_STATUS_ACTIVE if now < end_date else DB_STATUS_FAILED
            api_status = to_api_status(db_status)

            if now < end_date:
                message = (
                    f"Reduction actuelle: {reduction * 100:.1f} %, "
                    f"objectif: {target_value_pct * 100:.0f} %. Continue !"
                )
            else:
                message = (
                    f"Defi termine. Reduction: {reduction * 100:.1f} %, "
                    f"objectif: {target_value_pct * 100:.0f} %."
                )

        # Store cleaned message (and return it too)
        message = repair_mojibake(message)

        full_update_sql = text("""
            UPDATE public.challenge_instances
            SET
                reference_value = :reference_value,
                current_value = :current_value,
                progress_percent = :progress_percent,
                status = :status,
                last_evaluated_at = :last_evaluated_at,
                message = :message,
                updated_at = NOW()
            WHERE id = :instance_id
        """)

        no_message_update_sql = text("""
            UPDATE public.challenge_instances
            SET
                reference_value = :reference_value,
                current_value = :current_value,
                progress_percent = :progress_percent,
                status = :status,
                last_evaluated_at = :last_evaluated_at,
                updated_at = NOW()
            WHERE id = :instance_id
        """)

        fallback_update_sql = text("""
            UPDATE public.challenge_instances
            SET
                status = :status,
                updated_at = NOW()
            WHERE id = :instance_id
        """)

        params_full = {
            "reference_value": reference_value,
            "current_value": current_value,
            "progress_percent": progress_percent,
            "status": db_status,
            "last_evaluated_at": now,   # datetime, not iso string
            "message": message,
            "instance_id": instance_id,
        }

        try:
            db.execute(full_update_sql, params_full)
            db.commit()
        except (ProgrammingError, OperationalError) as e:
            db.rollback()
            print("[A54][WARN] UPDATE complet (avec message) impossible -> fallback sans message. Détail :", e)

            try:
                params_no_msg = dict(params_full)
                params_no_msg.pop("message", None)
                db.execute(no_message_update_sql, params_no_msg)
                db.commit()
            except Exception as e2:
                db.rollback()
                print("[A54][WARN] UPDATE complet (sans message) impossible -> fallback status only. Détail :", e2)

                try:
                    db.execute(fallback_update_sql, {"status": db_status, "instance_id": instance_id})
                    db.commit()
                except Exception as e3:
                    db.rollback()
                    print("[A54][WARN] UPDATE fallback impossible -> on renvoie quand même la réponse. Détail :", e3)

    # 6) Construire la réponse Pydantic
    return ChallengeEvaluateResponse(
        instance_id=row["instance_id"],
        challenge_id=row["challenge_id"],
        code=row["code"],
        name=row["name"],
        status=api_status,
        current_value=current_value,
        reference_value=reference_value,
        target_value=target_value,
        progress_percent=progress_percent,
        last_evaluated_at=now,
        message=message,
    )

