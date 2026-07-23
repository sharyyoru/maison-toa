ALTER TABLE booking_treatments
DROP COLUMN IF EXISTS price_prefix_en;

ALTER TABLE booking_treatments
ALTER COLUMN price_prefix TYPE numeric
USING (
  CASE
    WHEN price_prefix IS NULL OR btrim(price_prefix) = '' THEN NULL
    WHEN btrim(price_prefix) ~ '^[0-9]+([.][0-9]+)?$' THEN btrim(price_prefix)::numeric
    ELSE NULL
  END
);

COMMENT ON COLUMN booking_treatments.price_prefix IS
  'Optional starting price shown as From CHF in English or Dès CHF in French.';
