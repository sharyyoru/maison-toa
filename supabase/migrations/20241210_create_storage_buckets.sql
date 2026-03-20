-- Create all required storage buckets for the aesthetic clinic application
-- Run this migration in the Supabase SQL Editor

-- 1. AVATARS BUCKET - User profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Avatars bucket policies
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');


-- 2. PATIENT-AVATARS BUCKET - Patient profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-avatars', 'patient-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Patient avatars bucket policies
CREATE POLICY "Authenticated users can upload patient avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-avatars');

CREATE POLICY "Authenticated users can update patient avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patient-avatars');

CREATE POLICY "Authenticated users can delete patient avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-avatars');

CREATE POLICY "Patient avatars are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'patient-avatars');


-- 3. PATIENT-DOCUMENTS BUCKET - Patient documents and files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-documents', 'patient-documents', true, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Patient documents bucket policies
CREATE POLICY "Authenticated users can upload patient documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-documents');

CREATE POLICY "Authenticated users can update patient documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'patient-documents');

CREATE POLICY "Authenticated users can delete patient documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-documents');

CREATE POLICY "Patient documents are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'patient-documents');


-- 4. EMAIL-ATTACHMENTS BUCKET - Email attachment files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-attachments', 'email-attachments', true, 26214400, NULL)
ON CONFLICT (id) DO NOTHING;

-- Email attachments bucket policies
CREATE POLICY "Authenticated users can upload email attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'email-attachments');

CREATE POLICY "Authenticated users can update email attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'email-attachments');

CREATE POLICY "Authenticated users can delete email attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'email-attachments');

CREATE POLICY "Email attachments are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-attachments');


-- 5. CASH-RECEIPTS BUCKET - Cash receipt uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cash-receipts', 'cash-receipts', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Cash receipts bucket policies
CREATE POLICY "Authenticated users can upload cash receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cash-receipts');

CREATE POLICY "Authenticated users can update cash receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'cash-receipts');

CREATE POLICY "Authenticated users can delete cash receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cash-receipts');

CREATE POLICY "Cash receipts are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'cash-receipts');


-- 6. EMAIL-ASSETS BUCKET - Workflow email images/assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-assets', 'email-assets', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Email assets bucket policies
CREATE POLICY "Authenticated users can upload email assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can update email assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can delete email assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'email-assets');

CREATE POLICY "Email assets are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-assets');
