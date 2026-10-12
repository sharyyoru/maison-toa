-- =====================================================================
-- Phase 1 (storage) — SECURITY CONTAINMENT for storage.objects
-- =====================================================================
-- Setting `storage.buckets.public = false` only closes the unauthenticated
-- *public URL* path. Access through the Storage API is governed by RLS
-- policies on `storage.objects`, and this project has policies granting
-- `anon` / `public` direct access regardless of the bucket flag.
--
-- Verified after the main containment migration: `invoice-pdfs` objects were
-- still listable with the anon key even though the bucket was private.
--
-- Two of these also allow anonymous WRITES into patient photo buckets, which
-- is an upload-abuse and malware-distribution vector, not just a disclosure
-- problem.
--
-- As with the rest of Phase 1 this is deliberately blunt. Public booking
-- images, e-mail imagery and avatars will stop loading for unauthenticated
-- visitors. Phase 2 restores what is genuinely needed, scoped by bucket and
-- by clinic, and nothing that touches patient data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Patient-sensitive buckets — non-negotiable
-- ---------------------------------------------------------------------
-- Invoices and cash receipts identify patients and carry financial data.
drop policy if exists "Public can read invoice PDFs"        on storage.objects;
drop policy if exists "Cash receipts are publicly viewable" on storage.objects;

-- Anonymous upload into patient photo buckets.
drop policy if exists "Allow anon uploads to patient-photos"      on storage.objects;
drop policy if exists "Anonymous users can upload intake photos"  on storage.objects;

-- ---------------------------------------------------------------------
-- 2. Asset buckets — removed per the Phase 1 "no exceptions" rule
-- ---------------------------------------------------------------------
-- These hold marketing/UI assets rather than patient data, so they are
-- candidates to be restored in Phase 2 with an explicit justification
-- recorded in scripts/security/allowlist.json.
drop policy if exists "Avatars are publicly viewable"      on storage.objects;
drop policy if exists "Email assets are publicly viewable" on storage.objects;
drop policy if exists "Public can read emailgallery"       on storage.objects;
drop policy if exists "Public read booking-images"         on storage.objects;
drop policy if exists "doctor-images public read"          on storage.objects;

-- ---------------------------------------------------------------------
-- 3. Confirm no route to storage remains for anon / public
-- ---------------------------------------------------------------------
do $$
declare
  leftover int;
  r record;
begin
  select count(*) into leftover
    from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (roles::text like '%anon%' or roles::text like '%public%');

  if leftover > 0 then
    for r in
      select policyname, cmd, roles::text as roles
        from pg_catalog.pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and (roles::text like '%anon%' or roles::text like '%public%')
    loop
      raise warning 'storage.objects policy still open to anon/public: % (% on %)',
        r.policyname, r.cmd, r.roles;
    end loop;
    raise exception 'Phase 1 storage containment incomplete: % policy(ies) still grant anon/public', leftover;
  end if;

  raise notice 'Phase 1 storage: no policy on storage.objects grants anon or public';
end $$;
