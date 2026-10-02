-- DOC-003: storage bucket for user-managed document templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-templates', 'document-templates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated read document-templates" ON storage.objects;
CREATE POLICY "Authenticated read document-templates" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'document-templates');

DROP POLICY IF EXISTS "Authenticated upload document-templates" ON storage.objects;
CREATE POLICY "Authenticated upload document-templates" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'document-templates');

DROP POLICY IF EXISTS "Authenticated update document-templates" ON storage.objects;
CREATE POLICY "Authenticated update document-templates" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'document-templates');

DROP POLICY IF EXISTS "Authenticated delete document-templates" ON storage.objects;
CREATE POLICY "Authenticated delete document-templates" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'document-templates');
