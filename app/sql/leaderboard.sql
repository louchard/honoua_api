-- Utilisateurs (si tu as déjà une table users, adapte / ignore cette table)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,    -- ex: uuid/subject du token
  email         TEXT UNIQUE
);

-- Profil public pour le classement
CREATE TABLE IF NOT EXISTS profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pseudo        TEXT NOT NULL,
  country       TEXT NOT NULL,     -- ex: "FR"
  region        TEXT NOT NULL,     -- ex: "84" (INSEE) ou "IDF" / "ARA" etc.
  opt_in        INTEGER NOT NULL DEFAULT 0,  -- 1 si participe aux classements
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agrégat mensuel par utilisateur (per capita déjà normalisé)
CREATE TABLE IF NOT EXISTS user_month (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,     -- "YYYY-MM"
  n_sessions    INTEGER NOT NULL,  -- nombre de sessions dans le mois
  avg_per_session_per_capita REAL NOT NULL, -- gCO2e par session et par personne
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month)
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);
CREATE INDEX IF NOT EXISTS idx_profiles_region  ON profiles(region);
CREATE INDEX IF NOT EXISTS idx_user_month_month ON user_month(month);
