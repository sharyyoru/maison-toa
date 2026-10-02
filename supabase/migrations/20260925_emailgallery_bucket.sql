-- LIB-001: create the emailgallery bucket used by the Image Library and the
-- email template editor (it was referenced by code but never created).
INSERT INTO storage.buckets (id, name, public)
VALUES ('emailgallery', 'emailgallery', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can read emailgallery" ON storage.objects;
CREATE POLICY "Authenticated users can read emailgallery" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'emailgallery');

DROP POLICY IF EXISTS "Authenticated users can upload emailgallery" ON storage.objects;
CREATE POLICY "Authenticated users can upload emailgallery" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'emailgallery');

DROP POLICY IF EXISTS "Authenticated users can update emailgallery" ON storage.objects;
CREATE POLICY "Authenticated users can update emailgallery" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'emailgallery');

DROP POLICY IF EXISTS "Authenticated users can delete emailgallery" ON storage.objects;
CREATE POLICY "Authenticated users can delete emailgallery" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'emailgallery');

-- Public read so the images render inside sent emails
DROP POLICY IF EXISTS "Public can read emailgallery" ON storage.objects;
CREATE POLICY "Public can read emailgallery" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'emailgallery');
