from __future__ import annotations

try:
    # Chemin normal du projet
    from .base_class import Base  # type: ignore
except Exception:
    # Fallback pour environnements CI qui résolvent mal les paquets
    from sqlalchemy.orm import DeclarativeBase

    class Base(DeclarativeBase):  # type: ignore
        pass