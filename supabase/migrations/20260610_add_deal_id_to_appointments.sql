alter table public.appointments
  add column if not exists deal_id uuid;

alter table public.appointments
  drop constraint if exists appointments_deal_id_fkey;

alter table public.appointments
  add constraint appointments_deal_id_fkey
  foreign key (deal_id)
  references public.deals(id)
  on delete set null;

create index if not exists appointments_deal_id_idx
  on public.appointments(deal_id);
