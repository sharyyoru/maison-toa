-- BP-008: booking platform images for categories and treatments
alter table booking_categories add column if not exists image_url text;
alter table booking_treatments add column if not exists image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-images', 'booking-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated manage booking-images" ON storage.objects;
CREATE POLICY "Authenticated manage booking-images" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'booking-images') WITH CHECK (bucket_id = 'booking-images');

DROP POLICY IF EXISTS "Public read booking-images" ON storage.objects;
CREATE POLICY "Public read booking-images" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'booking-images');
