-- Add 'received' to email_status enum for inbound emails
ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'received';
