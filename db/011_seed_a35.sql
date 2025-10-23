INSERT INTO product (ean, name, brand, category, image_url) VALUES
('3229820123456','Yaourt Nature 4x125g','Lacto','Frais',NULL) ON CONFLICT (ean) DO NOTHING,
('3012345000001','Pâtes Spaghetti 500g','PastaCo','Épicerie salée',NULL) ON CONFLICT (ean) DO NOTHING;

INSERT INTO emission_factor (category, subcategory, unit, value, source) VALUES
('Frais','Yaourt','gCO2e/unité', 120.0, 'Base interne A35') ON CONFLICT DO NOTHING,
('Épicerie salée','Pâtes','gCO2e/100g', 180.0, 'Base interne A35') ON CONFLICT DO NOTHING;

INSERT INTO leaderboard_monthly (month, scope, pseudo, score, sessions) VALUES
(date_trunc('month', CURRENT_DATE), 'national', 'Alice', 240.5, 12),
(date_trunc('month', CURRENT_DATE), 'national', 'Bob',   255.9, 10),
(date_trunc('month', CURRENT_DATE), 'regional:IDF', 'Chloé', 238.1, 9)
ON CONFLICT DO NOTHING;
