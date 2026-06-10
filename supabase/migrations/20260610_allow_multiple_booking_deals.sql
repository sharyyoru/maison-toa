-- Online bookings create one deal per appointment. The legacy hourly
-- deduplication indexes prevent valid repeat bookings for the same patient.

alter table public.deals
  drop constraint if exists deals_patient_no_service_hour_unique;

alter table public.deals
  drop constraint if exists deals_patient_service_hour_unique;

drop index if exists public.deals_patient_no_service_hour_unique;
drop index if exists public.deals_patient_service_hour_unique;
