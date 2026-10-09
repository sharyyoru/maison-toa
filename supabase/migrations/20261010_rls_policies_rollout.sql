-- Proper RLS rollout for all previously policy-less tables.
-- Model: internal staff app uses the `authenticated` role -> full access.
-- `anon` gets nothing except explicit read policies for public booking data.
-- `service_role` (API routes) bypasses RLS by design.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tablename
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname='public'
    WHERE t.schemaname='public' AND t.rowsecurity = false
    GROUP BY t.tablename
    HAVING count(p.policyname) = 0
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tablename || '_authenticated_all', r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      r.tablename || '_authenticated_all', r.tablename
    );
  END LOOP;
END $$;

-- Public booking pages (visitors not logged in) read these two tables directly.
DROP POLICY IF EXISTS booking_doctors_anon_read ON public.booking_doctors;
CREATE POLICY booking_doctors_anon_read ON public.booking_doctors FOR SELECT TO anon USING (true);
