from sqlalchemy import create_engine, text

DB_URL = "postgresql+psycopg://honoua:Honou2035Lg!@localhost:5432/honoua"
engine = create_engine(DB_URL, echo=True, future=True)

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("Connexion OK :", result.scalar())
except Exception as e:
    print("Erreur de connexion :", e)
