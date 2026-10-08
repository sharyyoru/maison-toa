-- BP-018: optional online booking time-of-day range per treatment and per machine
alter table booking_treatments
  add column if not exists online_booking_start_time text,
  add column if not exists online_booking_end_time text;

alter table machines
  add column if not exists online_booking_start_time text,
  add column if not exists online_booking_end_time text;
