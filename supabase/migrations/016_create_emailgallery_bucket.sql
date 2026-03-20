-- Create emailgallery bucket for email template images
-- Run this migration in the Supabase SQL Editor

-- EMAILGALLERY BUCKET - Email template images/assets gallery
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('emailgallery', 'emailgallery', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Email gallery bucket policies
CREATE POLICY "Authenticated users can upload to emailgallery"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'emailgallery');

CREATE POLICY "Authenticated users can update emailgallery"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'emailgallery');

CREATE POLICY "Authenticated users can delete from emailgallery"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'emailgallery');

CREATE POLICY "Emailgallery images are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'emailgallery');
