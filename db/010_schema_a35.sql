-- A35 — Schéma de base (idempotent)
CREATE TABLE IF NOT EXISTS product (
  id SERIAL PRIMARY KEY,
  ean VARCHAR(32) UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_name ON product USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_product_brand ON product (brand);
CREATE INDEX IF NOT EXISTS idx_product_ean ON product (ean);

CREATE TABLE IF NOT EXISTS emission_factor (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  unit TEXT NOT NULL,             -- ex: gCO2e/unit
  value NUMERIC(12,4) NOT NULL,   -- valeur par unité
  source TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ef_category ON emission_factor (category, subcategory);

-- Classements mensuels — table d’agrégats (dev)
CREATE TABLE IF NOT EXISTS leaderboard_monthly (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,            -- 2025-10-01 pour “2025-10”
  scope TEXT NOT NULL,            -- 'national' | 'regional:<code>'
  pseudo TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL,   -- gCO2e / session / pers.
  sessions INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lb_month_scope ON leaderboard_monthly (month, scope);

