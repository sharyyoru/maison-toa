-- Create email-signatures storage bucket for user email signature images
-- Run this migration in the Supabase SQL Editor

-- EMAIL-SIGNATURES BUCKET - User email signature images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-signatures', 'email-signatures', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Email signatures bucket policies
CREATE POLICY "Users can upload their own signature images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'email-signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own signature images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'email-signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own signature images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'email-signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Email signature images are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-signatures');
