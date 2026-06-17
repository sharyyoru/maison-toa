-- Enable Supabase Realtime for patient detail page data.
-- Guard each table because ALTER PUBLICATION fails if a table is already present.

do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'patients',
    'patient_insurances',
    'consultations',
    'invoices',
    'invoice_line_items',
    'invoice_installments',
    'medidata_submissions',
    'appointments',
    'patient_notes',
    'emails',
    'tasks',
    'task_comments',
    'deals',
    'patient_prescriptions',
    'patient_intake_submissions',
    'patient_intake_preferences',
    'patient_health_background',
    'patient_measurements',
    'patient_treatment_areas',
    'patient_treatment_preferences',
    'patient_intake_photos',
    'patient_consultation_data'
  ];
begin
  foreach realtime_table in array realtime_tables loop
    if to_regclass(format('public.%I', realtime_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
