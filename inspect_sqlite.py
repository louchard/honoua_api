import sqlite3

conn = sqlite3.connect('honoua.db')
c = conn.cursor()

print("\n=== Derniers enregistrements de co2_cart_history ===\n")

c.execute("""
    SELECT
        id,
        user_id,
        period_type,
        period_label,
        total_co2_g,
        nb_articles,
        nb_distinct_products,
        total_distance_km,
        days_captured_by_tree,
        tree_equivalent,
        created_at
    FROM co2_cart_history
    ORDER BY id DESC
    LIMIT 10;
""")

rows = c.fetchall()

for row in rows:
    print(row)

conn.close()

# ==============================
# A54 – Tables pour les défis CO2
# ==============================
print("\n=== Création des tables de défis (challenges, challenge_instances) si nécessaire ===\n")

# Table des types de défis
c.execute("""
CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    metric TEXT NOT NULL,       -- ex : 'co2', 'distance'
    logic_type TEXT NOT NULL,   -- ex : 'reduction', 'volume'
    period_type TEXT NOT NULL,  -- ex : 'month', 'week'
    created_at TEXT NOT NULL,
    updated_at TEXT
);
""")

# Table des instances de défis (liée à un utilisateur)
c.execute("""
CREATE TABLE IF NOT EXISTS challenge_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,   -- ex : 'user'
    target_id INTEGER NOT NULL,  -- ex : 1 pour l'utilisateur 1
    status TEXT NOT NULL,        -- ex : 'en_cours', 'termine'
    start_date TEXT,
    end_date TEXT,
    reference_value REAL,
    current_value REAL,
    target_value REAL,
    progress_percent REAL,
    created_at TEXT NOT NULL,
    last_evaluated_at TEXT,
    FOREIGN KEY(challenge_id) REFERENCES challenges(id)
);
""")

conn.commit()

print("Tables 'challenges' et 'challenge_instances' OK (existantes ou créées).")

# Afficher la liste des tables pour vérification
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("\n=== Liste des tables SQLite ===")
print(c.fetchall())
