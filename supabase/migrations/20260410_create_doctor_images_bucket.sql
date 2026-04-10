-- Create public storage bucket for booking doctor profile images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-images',
  'doctor-images',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
DROP POLICY IF EXISTS "doctor-images public read" ON storage.objects;
CREATE POLICY "doctor-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'doctor-images');

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "doctor-images authenticated upload" ON storage.objects;
CREATE POLICY "doctor-images authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'doctor-images');

-- Allow authenticated users to update/replace
DROP POLICY IF EXISTS "doctor-images authenticated update" ON storage.objects;
CREATE POLICY "doctor-images authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'doctor-images');
