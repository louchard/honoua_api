from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ---------- Défis du catalogue ---------- #

class ChallengeRead(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None

    metric: str           # 'co2', 'distance', 'arbres', ...
    logic_type: str       # 'reduction_relative', 'objectif_absolu', ...
    period_type: str      # '30_jours_glissants', '7_jours_glissants', 'mois_calendaire', ...

    default_target_value: float
    scope_type: str       # 'individuel' (MVP), plus tard: 'groupe_interne', 'inter_groupes'
    active: bool

    class Config:
        # Compatibilité FastAPI / ORM
        orm_mode = True
        from_attributes = True


# ---------- Activation d'un défi ---------- #

class ChallengeActivateRequest(BaseModel):
    challenge_id: int


# ---------- Instance de défi (lecture) ---------- #

class ChallengeInstanceRead(BaseModel):
    instance_id: int
    challenge_id: int

    code: str
    name: str
    description: Optional[str] = None

    metric: str
    logic_type: str
    period_type: str

    status: str  # 'non_demarre' | 'en_cours' | 'reussi' | 'echoue' | 'expire'

    start_date: datetime
    end_date: datetime

    reference_value: Optional[float] = None
    current_value: Optional[float] = None
    target_value: Optional[float] = None

    progress_percent: Optional[float] = None

    created_at: datetime
    last_evaluated_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True


# ---------- Réponse à l'évaluation d'un défi ---------- #

class ChallengeEvaluateResponse(BaseModel):
    instance_id: int
    challenge_id: int

    code: str
    name: str

    status: str

    current_value: Optional[float] = None
    reference_value: Optional[float] = None
    target_value: Optional[float] = None
    progress_percent: Optional[float] = None

    last_evaluated_at: datetime

    message: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True
