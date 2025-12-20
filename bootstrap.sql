CREATE SCHEMA IF NOT EXISTS honou;
CREATE TABLE IF NOT EXISTS honou.products (
  id SERIAL PRIMARY KEY,
  ean13_clean VARCHAR(14),
  product_name TEXT,
  brand TEXT,
  category TEXT,
  carbon_product_kgco2e NUMERIC,
  carbon_pack_kgco2e NUMERIC,
  net_weight_kg NUMERIC,
  origin_country TEXT,
  origin_lat NUMERIC,
  origin_lon NUMERIC,
  zone_geo TEXT,
  coef_trans NUMERIC,
  origin_confidence TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE MATERIALIZED VIEW IF NOT EXISTS honou.mv_metrics_category AS
  SELECT category, COUNT(*)::INT AS n,
         AVG(carbon_product_kgco2e) AS avg_prod,
         AVG(carbon_pack_kgco2e)    AS avg_pack,
         AVG(COALESCE(carbon_product_kgco2e,0)+COALESCE(carbon_pack_kgco2e,0)) AS avg_total
  FROM honou.products
  GROUP BY category;

INSERT INTO honou.products (ean13_clean,product_name,brand,category,carbon_product_kgco2e,carbon_pack_kgco2e,net_weight_kg,origin_country)
VALUES
 ('3216549870123','Eau minérale 1L','MarqueA','Boissons, Eau',0.05,0.02,1.0,'France'),
 ('1234567890128','Limonade 50cl','MarqueB','Boissons sucrés, Limonade',0.4,0.08,0.5,'France'),
 ('7612345000001','Yaourt nature 4x125g','MarqueC','Produits laitiers, Yaourt',1.2,0.15,0.5,'France');

REFRESH MATERIALIZED VIEW honou.mv_metrics_category;

CREATE TABLE IF NOT EXISTS honou.co2_cart_history (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 INTEGER NULL,
    validated_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL,

    -- Impact CO₂ du panier
    total_co2_g             INTEGER NOT NULL,
    nb_articles             INTEGER NOT NULL,
    nb_distinct_products    INTEGER NOT NULL,

    -- Distances
    total_distance_km       NUMERIC(10,2) NOT NULL,

    -- Conversion CO₂ → jours → arbres
    days_captured_by_tree   NUMERIC(10,2) NOT NULL,
    tree_equivalent         NUMERIC(10,2) NOT NULL,

    -- Clés de période pour l’agrégation
    period_month            VARCHAR(7) NOT NULL,   -- 'YYYY-MM'
    period_week             VARCHAR(8) NOT NULL,   -- 'YYYY-WW'

    -- Score climat optionnel
    climate_score           SMALLINT NULL
);

