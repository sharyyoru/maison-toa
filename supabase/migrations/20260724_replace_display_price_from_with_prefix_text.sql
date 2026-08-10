ALTER TABLE booking_treatments
DROP COLUMN IF EXISTS display_price_from,
ADD COLUMN IF NOT EXISTS price_prefix text,
ADD COLUMN IF NOT EXISTS price_prefix_en text;

COMMENT ON COLUMN booking_treatments.price_prefix IS
  'Optional French free-text prefix displayed before the public booking price.';

COMMENT ON COLUMN booking_treatments.price_prefix_en IS
  'Optional English free-text prefix displayed before the public booking price.';
