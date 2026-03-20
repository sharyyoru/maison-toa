-- Invoice payment system with magic links
-- Add payment link token to consultations table for magic link access
alter table if exists consultations
  add column if not exists payment_link_token text unique,
  add column if not exists payment_link_expires_at timestamptz;

-- Create index for payment link token lookups
create index if not exists consultations_payment_link_token_idx 
  on consultations(payment_link_token) 
  where payment_link_token is not null;

-- Create invoice_pdfs bucket for storing generated PDF invoices
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', true)
on conflict (id) do nothing;

-- RLS policies for invoice-pdfs bucket
-- Drop existing policies if they exist to avoid conflicts
drop policy if exists "Authenticated users can upload invoice PDFs" on storage.objects;
drop policy if exists "Authenticated users can read invoice PDFs" on storage.objects;
drop policy if exists "Public can read invoice PDFs" on storage.objects;
drop policy if exists "Authenticated users can update invoice PDFs" on storage.objects;
drop policy if exists "Authenticated users can delete invoice PDFs" on storage.objects;

-- Allow authenticated users to upload invoices
create policy "Authenticated users can upload invoice PDFs"
on storage.objects for insert
to authenticated
with check (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to read all invoice PDFs
create policy "Authenticated users can read invoice PDFs"
on storage.objects for select
to authenticated
using (bucket_id = 'invoice-pdfs');

-- Allow public access to invoice PDFs (for magic link access)
create policy "Public can read invoice PDFs"
on storage.objects for select
to public
using (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to update invoice PDFs
create policy "Authenticated users can update invoice PDFs"
on storage.objects for update
to authenticated
using (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to delete invoice PDFs
create policy "Authenticated users can delete invoice PDFs"
on storage.objects for delete
to authenticated
using (bucket_id = 'invoice-pdfs');

-- RLS policies for consultations table to allow magic link access
-- Enable RLS on consultations if not already enabled
alter table consultations enable row level security;

-- Allow authenticated users full access to consultations
create policy "Authenticated users can view all consultations"
on consultations for select
to authenticated
using (true);

create policy "Authenticated users can insert consultations"
on consultations for insert
to authenticated
with check (true);

create policy "Authenticated users can update consultations"
on consultations for update
to authenticated
using (true);

create policy "Authenticated users can delete consultations"
on consultations for delete
to authenticated
using (true);

-- Allow public access to consultations via valid payment link token
create policy "Public can view consultation via payment link token"
on consultations for select
to public
using (
  payment_link_token is not null 
  and payment_link_expires_at > now()
);

-- Function to generate secure payment link token
create or replace function generate_payment_link_token()
returns text
language plpgsql
as $$
declare
  token text;
begin
  -- Generate a secure random token (32 characters)
  token := encode(gen_random_bytes(24), 'base64');
  -- Make it URL-safe
  token := replace(replace(replace(token, '+', '-'), '/', '_'), '=', '');
  return token;
end;
$$;

-- Add invoice PDF path column to store generated PDF location
alter table if exists consultations
  add column if not exists invoice_pdf_path text;

-- Create index for invoice PDF path
create index if not exists consultations_invoice_pdf_path_idx 
  on consultations(invoice_pdf_path) 
  where invoice_pdf_path is not null;

-- Add Stripe payment intent ID for tracking online payments
alter table if exists consultations
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_completed_at timestamptz;

-- Create index for Stripe payment intent lookups
create index if not exists consultations_stripe_payment_intent_idx 
  on consultations(stripe_payment_intent_id) 
  where stripe_payment_intent_id is not null;
