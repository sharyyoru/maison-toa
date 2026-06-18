-- =============================================================================
-- Security Fix: Restrict storage bucket SELECT access to authenticated users
-- only for buckets containing sensitive patient data.
--
-- Buckets left unchanged (intentionally public): invoice-pdfs, cash-receipts,
-- doctor-images, email-assets, avatars, patient-photos.
-- =============================================================================

-- patient-documents: contains patient medical PDFs, reports, uploads
DROP POLICY IF EXISTS "Patient documents are publicly viewable" ON storage.objects;
CREATE POLICY "Authenticated users can read patient documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-documents');

-- patient-avatars: contains patient profile photos
DROP POLICY IF EXISTS "Patient avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Authenticated users can read patient avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-avatars');

-- email-attachments: contains consultation PDFs sent via email
DROP POLICY IF EXISTS "Email attachments are publicly viewable" ON storage.objects;
CREATE POLICY "Authenticated users can read email attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'email-attachments');
