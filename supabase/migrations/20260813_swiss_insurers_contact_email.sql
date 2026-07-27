-- Add contact_email to swiss_insurers for HeaderInsuranceEmailButton
alter table if exists swiss_insurers
  add column if not exists contact_email text;
