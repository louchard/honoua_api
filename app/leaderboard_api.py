# app/leaderboard_api.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
import sqlite3, os, time

router = APIRouter()

DB_PATH = os.environ.get("HONOUA_DB", "honoua.db")

# --- Auth minimale (à brancher sur ton A19) ---------------------------------
def get_current_user_id(authorization: Optional[str] = None) -> str:
    """
    Extrait un user_id depuis un token Bearer très simplement.
    À remplacer par ta vraie vérif (A19). Ici, on attend:
      Authorization: Bearer <user_id>
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = authorization.split(" ", 1)[1].strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def ensure_schema():
    conn = db()
    try:
        with open(os.path.join("app","sql","leaderboard.sql"), "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()
    finally:
        conn.close()

ensure_schema()

# --- Models ------------------------------------------------------------------
class Profile(BaseModel):
    pseudo: str = Field(..., min_length=2, max_length=40)
    country: str = Field(..., min_length=2, max_length=2, description="ISO alpha-2, ex: FR")
    region: str = Field(..., min_length=1, max_length=10, description="Code région (INSEE/ISO)")
    opt_in: bool = False

class SubmitMonthlyPayload(BaseModel):
    month: str = Field(..., regex=r"^\d{4}-\d{2}$")  # YYYY-MM
    n_sessions: int = Field(..., ge=1)
    avg_per_session_gco2e: float = Field(..., gt=0)
    household_size: int = Field(..., ge=1)

class LeaderboardRow(BaseModel):
    rank: int
    pseudo: str
    score: float                      # gCO2e/session/personne
    n: int                            # n_sessions

# --- Helpers -----------------------------------------------------------------
MIN_SESSIONS = 5  # anti-bruit: min sessions pour être classé

def upsert_user(conn, user_id: str):
    conn.execute("INSERT OR IGNORE INTO users(id) VALUES (?)", (user_id,))

def get_profile(conn, user_id: str):
    cur = conn.execute("SELECT * FROM profiles WHERE user_id=?", (user_id,))
    return cur.fetchone()

def upsert_profile(conn, user_id: str, p: Profile):
    upsert_user(conn, user_id)
    conn.execute("""
        INSERT INTO profiles (user_id,pseudo,country,region,opt_in,updated_at)
        VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            pseudo=excluded.pseudo,
            country=excluded.country,
            region=excluded.region,
            opt_in=excluded.opt_in,
            updated_at=CURRENT_TIMESTAMP
    """, (user_id, p.pseudo.strip(), p.country.upper(), p.region.strip(), 1 if p.opt_in else 0))

def submit_month(conn, user_id: str, payload: SubmitMonthlyPayload):
    # normalisation per capita
    per_capita = float(payload.avg_per_session_gco2e) / float(payload.household_size)

    conn.execute("""
        INSERT INTO user_month (user_id, month, n_sessions, avg_per_session_per_capita, updated_at)
        VALUES (?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,month) DO UPDATE SET
            n_sessions=excluded.n_sessions,
            avg_per_session_per_capita=excluded.avg_per_session_per_capita,
            updated_at=CURRENT_TIMESTAMP
    """, (user_id, payload.month, int(payload.n_sessions), per_capita))

def rows_for_scope(conn, scope: Literal["country","region"], month: str, limit: int, offset: int):
    if scope not in ("country","region"):
        raise HTTPException(400, "Invalid scope")

    # On joint u_month + profiles et on filtre opt_in + qualité (n_sessions >= MIN_SESSIONS)
    sql = f"""
        SELECT p.pseudo,
               um.n_sessions,
               um.avg_per_session_per_capita AS score
        FROM user_month um
        JOIN profiles p ON p.user_id = um.user_id
        WHERE um.month = ?
          AND p.opt_in = 1
          AND um.n_sessions >= ?
        """
    params = [month, MIN_SESSIONS]

    if scope == "country":
        # Si tu veux filtrer par pays, ajoute un param country=... au GET et adapte ici
        pass
    else:
        # Idem pour region : on pourrait accepter ?region=IDF etc.
        pass

    sql += " ORDER BY score ASC, um.n_sessions DESC, um.updated_at DESC LIMIT ? OFFSET ?"
    params += [limit, offset]

    cur = conn.execute(sql, params)
    return cur.fetchall()

# --- Endpoints ---------------------------------------------------------------

@router.get("/api/profile", response_model=Profile)
def get_my_profile(user_id: str = Depends(get_current_user_id)):
    conn = db()
    try:
        r = get_profile(conn, user_id)
        if not r:
            # profil par défaut (opt_in false) — pseudo anonyme
            return Profile(pseudo="Anonyme", country="FR", region="IDF", opt_in=False)
        return Profile(
            pseudo=r["pseudo"],
            country=r["country"],
            region=r["region"],
            opt_in=bool(r["opt_in"])
        )
    finally:
        conn.close()

@router.patch("/api/profile", response_model=Profile)
def update_my_profile(payload: Profile, user_id: str = Depends(get_current_user_id)):
    conn = db()
    try:
        upsert_profile(conn, user_id, payload)
        conn.commit()
        return payload
    finally:
        conn.close()

@router.post("/api/leaderboard/submit")
def submit_monthly_scores(payload: SubmitMonthlyPayload, user_id: str = Depends(get_current_user_id)):
    """
    Reçoit l'agrégat mensuel pour l'utilisateur courant.
    - Normalise per capita côté serveur
    - Applique min sessions côté classement (mais on stocke tout)
    """
    conn = db()
    try:
        upsert_user(conn, user_id)
        # Optionnel: vérifier que l'utilisateur a un profil opt_in actif
        prof = get_profile(conn, user_id)
        if not prof or not bool(prof["opt_in"]):
            # On autorise le dépôt, mais il ne sera pas classé tant que opt_in=0
            pass
        submit_month(conn, user_id, payload)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@router.get("/api/leaderboard", response_model=List[LeaderboardRow])
def get_leaderboard(
    scope: Literal["country","region"] = Query("country"),
    month: str = Query(..., regex=r"^\d{4}-\d{2}$"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id)
):
    """
    Retourne le classement (score ascendant = meilleur).
    NOTE: on ne filtre pas encore par pays/région faute de param ; à ajouter si besoin.
    """
    conn = db()
    try:
        rows = rows_for_scope(conn, scope, month, limit, offset)
        # calcule le rank localement
        out = []
        rank = offset + 1
        for r in rows:
            out.append(LeaderboardRow(
                rank=rank,
                pseudo=r["pseudo"],
                score=float(r["score"]),
                n=int(r["n_sessions"])
            ))
            rank += 1
        return out
    finally:
        conn.close()
