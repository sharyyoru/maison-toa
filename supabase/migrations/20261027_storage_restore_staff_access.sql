-- =====================================================================
-- Restore STAFF access to the billing document buckets
-- =====================================================================
-- Why this is needed:
--
-- The Phase 1 storage containment dropped the policies that exposed
-- `invoice-pdfs` and `cash-receipts`, because those buckets hold documents
-- that identify a patient and the amount billed and they were readable by
-- anyone on the internet.
--
-- Those policies were declared `TO public`. In PostgreSQL the `public` role is
-- every role, so `TO public` covered `authenticated` as well as `anon`.
-- Dropping them therefore removed logged-in staff access at the same time, and
-- the storage API gives no hint that this is what happened:
--
--   * getPublicUrl() still returns a well-formed URL for a private bucket, but
--     fetching it fails with "Bucket not found".
--   * createSignedUrl() from the browser needs SELECT on storage.objects; with
--     no applicable policy it just fails.
--
-- Result: "they cannot download the pdf file".
--
-- This migration grants the access back to `authenticated` ONLY. `anon` is
-- deliberately not mentioned, so unauthenticated visitors still get nothing and
-- the buckets stay private. Patient-facing downloads (the payment link page)
-- are served instead by a short-lived signed URL minted server-side after the
-- payment token has been validated — see /api/invoices/get-by-token.
-- =====================================================================

-- ---------------------------------------------------------------------
-- invoice-pdfs — read only.
-- ---------------------------------------------------------------------
-- Uploads are performed server-side with the service role
-- (/api/invoices/generate-pdf, medidata routes), so staff need SELECT only.
-- Keeping it read-only means a compromised staff session cannot overwrite or
-- delete issued invoices, which matters for billing auditability.
drop policy if exists "invoice_pdfs_authenticated_read" on storage.objects;
create policy "invoice_pdfs_authenticated_read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'invoice-pdfs');

-- ---------------------------------------------------------------------
-- cash-receipts — read + create.
-- ---------------------------------------------------------------------
-- Staff upload receipts from the patient file
-- (MedicalConsultationsCard -> cash-receipts.upload) and view them again.
-- No UPDATE/DELETE: a receipt is evidence of a payment and should not be
-- silently replaced or removed from the browser.
drop policy if exists "cash_receipts_authenticated_read" on storage.objects;
create policy "cash_receipts_authenticated_read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'cash-receipts');

drop policy if exists "cash_receipts_authenticated_insert" on storage.objects;
create policy "cash_receipts_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'cash-receipts');

-- ---------------------------------------------------------------------
-- Verify, and report anything still open to anon/public.
-- ---------------------------------------------------------------------
do $$
declare
  missing text[] := array[]::text[];
  r record;
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                  and policyname='invoice_pdfs_authenticated_read') then
    missing := missing || 'invoice_pdfs_authenticated_read';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                  and policyname='cash_receipts_authenticated_read') then
    missing := missing || 'cash_receipts_authenticated_read';
  end if;
  if array_length(missing, 1) is not null then
    raise exception 'storage policies were not created: %', array_to_string(missing, ', ');
  end if;

  -- The containment guarantee: nothing here may be open to anon/public again.
  for r in
    select policyname, cmd, roles::text as roles
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (roles::text like '%anon%' or roles::text like '%public%')
  loop
    raise warning 'storage.objects policy open to anon/public: % (% on %)', r.policyname, r.cmd, r.roles;
  end loop;

  raise notice 'Staff access restored to invoice-pdfs (read) and cash-receipts (read+create); anon unchanged.';
end $$;

-- ---------------------------------------------------------------------
-- The buckets must STAY private. Patient-facing access is via signed URLs.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from storage.buckets where id in ('invoice-pdfs','cash-receipts') and public = true) then
    raise warning 'invoice-pdfs and/or cash-receipts is PUBLIC. Invoice PDFs identify patients and amounts; they must not be world-readable. Set public = false and rely on signed URLs.';
  end if;
end $$;
