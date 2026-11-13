-- Metric labels: the last "lb" in the catalog data.
--
-- The seed came from a US price list, so the free-text pack label
-- `Product.weight` still read "25 lb cylinder" / "50 lb cylinder" on 13 gas
-- rows, and the recovery cylinder's own name was "Recovery Cylinder 50 lb".
-- Gas prices and the storefront already work in kg (`weightKg`, set from
-- these labels by 2026-09-08_price_per_kg.sql); the label is what emails
-- (price-drop, back-in-stock) still quote as the variant, and the recovery
-- cylinder's name is shown everywhere. The admin size editor already
-- rewrites the label from the numbers on save (lib/actions/inventory) —
-- this does the same for the rows nobody has edited since.
--
--   npx prisma db execute --file prisma/sql/2026-11-13_metric_labels.sql
--
-- Safe to re-run: every statement is guarded on the old text.
--
-- Reversal, if ever needed (values before this file):
--   HC-REC-50  name 'Recovery Cylinder 50 lb', weight '50 lb cylinder'
--   gas rows   weight '<round(weightKg / 0.45359237)> lb cylinder'

-- 1 · Gas rows: "<n> lb cylinder" → "<weightKg> kg <container>" — the same
--     text as lib/productFamily sizeLabel(): trailing zeros dropped.
UPDATE "Product"
SET "weight" = regexp_replace(round("weightKg"::numeric, 2)::text, '\.?0+$', '') || ' kg ' || lower("containerType")
WHERE "category" IN ('cylinders', 'blends')
  AND "weight" ~* '^\s*\d+(\.\d+)?\s*lb\y';  -- \y: word boundary (\b is backspace in PostgreSQL)

-- 2 · The recovery cylinder (sold per unit; its rating is 50 lb = 22.68 kg of refrigerant).
UPDATE "Product"
SET "name" = 'Recovery Cylinder 22.7 kg', "weight" = '22.7 kg cylinder'
WHERE "sku" = 'HC-REC-50' AND "name" = 'Recovery Cylinder 50 lb';
