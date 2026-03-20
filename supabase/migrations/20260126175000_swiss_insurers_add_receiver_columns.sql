-- Migration: Add Receiver GLN and TP Allowed columns to Swiss Insurers
-- Purpose: Support invoice routing (different receiver GLN) and Tiers Payant status
-- Date: 2026-01-26

-- Add receiver_gln column (text, nullable)
alter table if exists swiss_insurers 
add column if not exists receiver_gln text;

comment on column swiss_insurers.receiver_gln is 'GLN for invoice transmission if different from main GLN';

-- Add tp_allowed column (boolean, default true)
alter table if exists swiss_insurers 
add column if not exists tp_allowed boolean default true;

comment on column swiss_insurers.tp_allowed is 'Whether Tiers Payant (insurer pays directly) is allowed';

-- Create index for receiver_gln lookup optimization
create index if not exists swiss_insurers_receiver_gln_idx on swiss_insurers(receiver_gln);
