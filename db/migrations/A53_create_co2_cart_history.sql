
CREATE TABLE IF NOT EXISTS co2_cart_history (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             INTEGER NULL,
    validated_at        TIMESTAMP WITHOUT TIME ZONE NOT NULL,

    total_co2_g         INTEGER NOT NULL,
    nb_articles         INTEGER NOT NULL,
    nb_distinct_products INTEGER NOT NULL,

    total_distance_km   NUMERIC(10,2) NOT NULL,

    days_captured_by_tree NUMERIC(10,2) NOT NULL,
    tree_equivalent     NUMERIC(10,2) NOT NULL,

    period_month        VARCHAR(7) NOT NULL,
    period_week         VARCHAR(8) NOT NULL,

    climate_score       SMALLINT NULL
);
