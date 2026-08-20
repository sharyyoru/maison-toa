alter table public.appointments
  add column if not exists cancellation_source text;

alter table public.appointments
  drop constraint if exists appointments_cancellation_source_check;

alter table public.appointments
  add constraint appointments_cancellation_source_check
  check (cancellation_source is null or cancellation_source in ('patient', 'clinic', 'deposit_unpaid'));

-- Recover the automated source where the linked, expired deposit invoice
-- provides enough evidence. Older cancellations have no reliable patient vs.
-- staff audit data, so they use the clinic fallback.
update public.appointments appointment
set cancellation_source = 'deposit_unpaid'
where appointment.status = 'cancelled'
  and appointment.cancellation_source is null
  and exists (
    select 1
    from public.invoices invoice
    where invoice.appointment_id = appointment.id
      and upper(invoice.status) = 'CANCELLED'
      and invoice.deposit_deadline_at is not null
      and invoice.deposit_deadline_at <= now()
  );

update public.appointments
set cancellation_source = 'clinic'
where status = 'cancelled'
  and cancellation_source is null;

create or replace function public.set_appointment_cancellation_source()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancellation_source := coalesce(new.cancellation_source, 'clinic');
  elsif new.status is distinct from 'cancelled' then
    new.cancellation_source := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_appointment_cancellation_source on public.appointments;
create trigger set_appointment_cancellation_source
before update on public.appointments
for each row execute function public.set_appointment_cancellation_source();
