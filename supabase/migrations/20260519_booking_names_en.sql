ALTER TABLE booking_categories
ADD COLUMN IF NOT EXISTS name_en TEXT;

ALTER TABLE booking_treatments
ADD COLUMN IF NOT EXISTS name_en TEXT;

ALTER TABLE booking_categories
ADD COLUMN IF NOT EXISTS description_en TEXT;

ALTER TABLE booking_treatments
ADD COLUMN IF NOT EXISTS description_en TEXT;
