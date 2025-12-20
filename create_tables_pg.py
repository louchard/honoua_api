# create_tables_pg.py

import os
from sqlalchemy import create_engine
from app.main import Base

# ⚠️ Mets ici TON URL PostgreSQL (celle qui a fonctionné dans test_pg.py)
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://honoua:Honou2035Lg!@localhost:5432/honoua",
)

engine = create_engine(DB_URL, echo=True, future=True)

def main():
    print("Création des tables dans la base liée à engine...")
    print(f"Engine URL utilisé : {engine.url}")
    Base.metadata.create_all(bind=engine)
    print("Terminé.")

if __name__ == "__main__":
    main()
