create extension if not exists "pgcrypto";

-- Users table linked to Supabase auth.users
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff',
  full_name text,
  email text,
  designation text,
  created_at timestamptz default now()
);

-- Patients
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  gender text check (gender in ('male','female','other')),
  dob date,
  marital_status text,
  nationality text,
  street_address text,
  postal_code text,
  town text,
  profession text,
  current_employer text,
  source text check (source in ('manual','event','meta','google')) default 'manual',
  notes text,
  avatar_url text,
  language_preference text,
  clinic_preference text,
  lifecycle_stage text,
  contact_owner_name text,
  contact_owner_email text,
  street_number text,
  country text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  created_by_user_id uuid references users(id),
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists patients_email_idx on patients(email);
-- Unique email index - wrapped in DO block to handle existing duplicates gracefully
DO $$ BEGIN
  CREATE UNIQUE INDEX patients_email_unique ON patients (lower(email));
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN others THEN 
    -- Index may already exist or duplicates prevent creation - skip silently
    RAISE NOTICE 'Skipping patients_email_unique index: %', SQLERRM;
END $$;
create index if not exists patients_last_name_idx on patients(last_name);

-- Patient insurance information
create table if not exists patient_insurances (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  provider_name text not null,
  card_number text not null,
  insurance_type text check (insurance_type in ('private','semi_private','basic')) not null,
  created_at timestamptz default now()
);

create index if not exists patient_insurances_patient_id_idx on patient_insurances(patient_id);

-- Providers (doctors, clinicians)
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- Appointment status enum
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'scheduled',
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Appointments
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz,
  status appointment_status not null default 'scheduled',
  reason text,
  location text,
  source text check (source in ('manual','ai')) default 'manual',
  created_at timestamptz default now()
);

create index if not exists appointments_patient_id_idx on appointments(patient_id);
create index if not exists appointments_provider_id_idx on appointments(provider_id);
create index if not exists appointments_start_time_idx on appointments(start_time);

-- Deal stage type enum
DO $$ BEGIN
  CREATE TYPE deal_stage_type AS ENUM (
    'lead',
    'consultation',
    'surgery',
    'post_op',
    'follow_up',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Deal pipeline stages
create table if not exists deal_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type deal_stage_type not null default 'other',
  sort_order int not null,
  is_default boolean not null default false
);

-- Services
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null,
  description text,
  base_price numeric(12, 2) not null default 0,
  category_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Deals (cases / opportunities)
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  stage_id uuid not null references deal_stages(id),
  service_id uuid references services(id) on delete set null,
  pipeline text,
  contact_label text,
  location text,
  title text,
  value numeric(12,2),
  notes text,
  owner_id uuid references users(id) on delete set null,
  owner_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add owner columns to deals if they don't exist (migration)
alter table if exists deals
  add column if not exists owner_id uuid references users(id) on delete set null,
  add column if not exists owner_name text;

create index if not exists deals_owner_id_idx on deals(owner_id);

create index if not exists deals_patient_id_idx on deals(patient_id);
create index if not exists deals_stage_id_idx on deals(stage_id);

-- Add service_interest and source columns to deals (for lead tracking)
alter table if exists deals
  add column if not exists service_interest text,
  add column if not exists source text;

-- Crisalix reconstructions
create table if not exists crisalix_reconstructions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  crisalix_patient_id integer not null,
  reconstruction_type text not null,
  player_id text,
  created_at timestamp with time zone default now() not null
);

create index if not exists crisalix_reconstructions_patient_type_idx on crisalix_reconstructions(patient_id, reconstruction_type);

-- Workflow trigger type enum
DO $$ BEGIN
  CREATE TYPE workflow_trigger_type AS ENUM (
    'deal_stage_changed',
    'patient_created',
    'appointment_created',
    'appointment_completed',
    'appointment_updated',
    'form_submitted',
    'task_completed',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add missing values to workflow_trigger_type enum (for existing databases)
DO $$ BEGIN
  ALTER TYPE workflow_trigger_type ADD VALUE IF NOT EXISTS 'patient_created';
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE workflow_trigger_type ADD VALUE IF NOT EXISTS 'appointment_completed';
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE workflow_trigger_type ADD VALUE IF NOT EXISTS 'form_submitted';
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE workflow_trigger_type ADD VALUE IF NOT EXISTS 'task_completed';
EXCEPTION WHEN others THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE workflow_trigger_type ADD VALUE IF NOT EXISTS 'manual';
EXCEPTION WHEN others THEN null;
END $$;

-- Workflows
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type workflow_trigger_type not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Ensure workflows has a JSONB config column for trigger-specific settings
alter table if exists workflows
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Workflow action type enum
DO $$ BEGIN
  CREATE TYPE workflow_action_type AS ENUM (
    'draft_email_patient',
    'draft_email_insurance',
    'generate_postop_doc'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Workflow actions
create table if not exists workflow_actions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  action_type workflow_action_type not null,
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 1
);

create index if not exists workflow_actions_workflow_id_idx on workflow_actions(workflow_id);

-- Email template type enum
DO $$ BEGIN
  CREATE TYPE email_template_type AS ENUM (
    'patient',
    'insurance',
    'post_op'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Email templates
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type email_template_type not null,
  subject_template text not null,
  body_template text not null,
  created_at timestamptz default now()
);

-- Email status and direction enums
DO $$ BEGIN
  CREATE TYPE email_status AS ENUM (
    'draft',
    'queued',
    'sent',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE email_direction AS ENUM (
    'outbound',
    'inbound'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Emails (patient + insurance)
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  to_address text not null,
  from_address text,
  subject text not null,
  body text not null,
  status email_status not null default 'draft',
  direction email_direction not null default 'outbound',
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists emails_patient_id_idx on emails(patient_id);
create index if not exists emails_deal_id_idx on emails(deal_id);

create table if not exists email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz default now()
);

create index if not exists email_attachments_email_id_idx on email_attachments(email_id);

-- WhatsApp message status and direction enums
DO $$ BEGIN
  CREATE TYPE whatsapp_status AS ENUM (
    'queued',
    'sent',
    'delivered',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_direction AS ENUM (
    'outbound',
    'inbound'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- WhatsApp messages linked to a patient
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete set null,
  to_number text not null,
  from_number text,
  body text not null,
  status whatsapp_status not null default 'queued',
  direction whatsapp_direction not null default 'outbound',
  provider_message_sid text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists whatsapp_messages_patient_id_idx on whatsapp_messages(patient_id);

-- Document type enum
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'post_op',
    'report',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Documents (e.g. AI-generated post-op instructions)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  type document_type not null default 'other',
  title text not null,
  content text not null,
  created_by_user_id uuid references users(id),
  created_by text,
  created_at timestamptz default now()
);

create index if not exists documents_patient_id_idx on documents(patient_id);

-- Patient notes (internal collaboration notes on a patient)
create table if not exists patient_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  author_user_id uuid references users(id),
  author_name text,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists patient_notes_patient_id_idx on patient_notes(patient_id);

-- Mentions/messages generated from patient notes
create table if not exists patient_note_mentions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references patient_notes(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  mentioned_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists patient_note_mentions_recipient_idx
  on patient_note_mentions(mentioned_user_id, read_at);

-- Task status / priority / type enums
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'not_started',
    'in_progress',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM (
    'low',
    'medium',
    'high'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM (
    'todo',
    'call',
    'email',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tasks linked to a patient with optional assignee
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  name text not null,
  content text,
  status task_status not null default 'not_started',
  priority task_priority not null default 'medium',
  type task_type not null default 'todo',
  activity_date timestamptz,
  created_by_user_id uuid references users(id),
  created_by_name text,
  assigned_user_id uuid references users(id),
  assigned_user_name text,
  assigned_read_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_patient_id_idx on tasks(patient_id);
create index if not exists tasks_assigned_user_id_idx on tasks(assigned_user_id);

-- Patient edit locks (which user is currently editing which patient)
create table if not exists patient_edit_locks (
  patient_id uuid primary key references patients(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  user_name text,
  user_avatar_url text,
  updated_at timestamptz not null default now()
);

create index if not exists patient_edit_locks_user_id_idx
  on patient_edit_locks(user_id);

-- Consultation record type enum (aligns with medical tabs: notes onward)
DO $$ BEGIN
  CREATE TYPE consultation_record_type AS ENUM (
    'notes',
    'prescription',
    'invoice',
    'file',
    'photo',
    '3d',
    'patient_information',
    'documents',
    'form_photos'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Consultations linked to a patient
create table if not exists consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  consultation_id text not null,
  title text not null,
  record_type consultation_record_type not null,
  doctor_user_id uuid references users(id),
  doctor_name text,
  scheduled_at timestamptz not null,
  payment_method text,
  content text,
  duration_seconds integer,
  invoice_total_amount numeric(12, 2),
  invoice_is_complimentary boolean not null default false,
  invoice_is_paid boolean not null default false,
  cash_receipt_path text,
  created_by_user_id uuid references users(id),
  created_by_name text,
  created_at timestamptz default now(),
  is_archived boolean not null default false,
  archived_at timestamptz
);

create index if not exists consultations_patient_id_idx on consultations(patient_id);

-- Comments on tasks
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_user_id uuid references users(id),
  author_name text,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists task_comments_task_id_idx on task_comments(task_id);

-- Mentions generated from task comments
create table if not exists task_comment_mentions (
  id uuid primary key default gen_random_uuid(),
  task_comment_id uuid not null references task_comments(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  mentioned_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists task_comment_mentions_recipient_idx
  on task_comment_mentions(mentioned_user_id, read_at);

-- Service categories (e.g. Aesthetics, Reconstructive)
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int not null default 1,
  created_at timestamptz default now()
);

create unique index if not exists service_categories_name_key
  on service_categories(name);

-- Services offered by the clinic, grouped by category
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references service_categories(id) on delete restrict,
  name text not null,
  description text,
  is_active boolean not null default true,
  base_price numeric(12,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists services_category_id_idx on services(category_id);
create unique index if not exists services_category_id_name_key
  on services(category_id, name);

-- Service groups (bundles of services)
create table if not exists service_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

create unique index if not exists service_groups_name_key
  on service_groups(name);

-- Many-to-many relation between service groups and services
create table if not exists service_group_services (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references service_groups(id) on delete cascade,
  service_id uuid not null references services(id) on delete restrict,
  created_at timestamptz default now()
);

create unique index if not exists service_group_services_group_service_key
  on service_group_services(group_id, service_id);

alter table if exists service_groups
  add column if not exists discount_percent numeric(5, 2);

alter table if exists service_group_services
  add column if not exists discount_percent numeric(5, 2),
  add column if not exists quantity integer not null default 1;

-- Seed initial Services data: Aesthetics category and core services
insert into service_categories (id, name, description, sort_order)
values (
  gen_random_uuid(),
  'Aesthetics',
  'Aesthetic and cosmetic procedures',
  1
)
on conflict (name) do nothing;

insert into services (id, category_id, name, description, is_active, base_price)
select
  gen_random_uuid(),
  c.id,
  s.name,
  s.description,
  true,
  s.base_price
from service_categories c
join (
  values
    ('Liposuction', 'Targeted fat removal', null::numeric),
    ('Breast Reconstruction', 'Reconstructive breast surgery', null::numeric),
    ('Filler', 'Dermal filler treatment', null::numeric),
    ('Blepharoplasty', 'Eyelid surgery', null::numeric)
) as s(name, description, base_price)
  on c.name = 'Aesthetics'
on conflict (category_id, name) do nothing;

-- Chat folders for organizing conversations per staff user
create table if not exists chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists chat_folders_user_id_idx on chat_folders(user_id);

-- Chat conversations linked to a user and optional folder/patient/deal
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  folder_id uuid references chat_folders(id) on delete set null,
  title text,
  patient_id uuid references patients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_archived boolean not null default false,
  archived_at timestamptz
);

create index if not exists chat_conversations_user_id_idx
  on chat_conversations(user_id);

create index if not exists chat_conversations_folder_id_idx
  on chat_conversations(folder_id);

create index if not exists chat_conversations_user_updated_idx
  on chat_conversations(user_id, updated_at desc);

alter table if exists chat_conversations
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists chat_conversations_user_archived_idx
  on chat_conversations(user_id, is_archived, updated_at desc);

-- Chat messages belonging to conversations
DO $$ BEGIN
  CREATE TYPE chat_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role chat_message_role not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists chat_messages_conversation_id_idx
  on chat_messages(conversation_id);

create index if not exists chat_messages_conversation_created_idx
  on chat_messages(conversation_id, created_at);

-- Swiss Insurance Companies (KVG/UVG/IVG/MVG/VVG)
create table if not exists swiss_insurers (
  id uuid primary key default gen_random_uuid(),
  gln text unique not null, -- Global Location Number
  bag_number text, -- BAG registration number
  name text not null,
  name_fr text,
  name_de text,
  address_street text,
  address_postal_code text,
  address_city text,
  address_canton text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists swiss_insurers_gln_idx on swiss_insurers(gln);
create index if not exists swiss_insurers_bag_number_idx on swiss_insurers(bag_number);

-- Swiss Insurer Laws (many-to-many relationship)
create table if not exists swiss_insurer_laws (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references swiss_insurers(id) on delete cascade,
  law_type text check (law_type in ('KVG', 'UVG', 'IVG', 'MVG', 'VVG')) not null,
  created_at timestamptz default now(),
  unique(insurer_id, law_type)
);

create index if not exists swiss_insurer_laws_insurer_id_idx on swiss_insurer_laws(insurer_id);
create index if not exists swiss_insurer_laws_law_type_idx on swiss_insurer_laws(law_type);

-- Enhanced patient insurance with Swiss-specific fields
alter table if exists patient_insurances
  add column if not exists insurer_id uuid references swiss_insurers(id) on delete set null,
  add column if not exists gln text,
  add column if not exists avs_number text, -- AHV/AVS Swiss social security number
  add column if not exists policy_number text,
  add column if not exists law_type text check (law_type in ('KVG', 'UVG', 'IVG', 'MVG', 'VVG')),
  add column if not exists billing_type text check (billing_type in ('TG', 'TP')) default 'TG', -- Tiers Garant or Tiers Payant
  add column if not exists case_number text,
  add column if not exists accident_date date,
  add column if not exists is_primary boolean default true;

-- MediData invoice submissions
create table if not exists medidata_submissions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  insurer_id uuid references swiss_insurers(id) on delete set null,
  
  -- Invoice details
  invoice_number text not null,
  invoice_date date not null,
  invoice_amount numeric(12, 2) not null,
  billing_type text check (billing_type in ('TG', 'TP')) not null, -- Tiers Garant or Tiers Payant
  law_type text check (law_type in ('KVG', 'UVG', 'IVG', 'MVG', 'VVG')) not null,
  
  -- XML content
  xml_content text, -- The generated Sumex XML
  xml_version text default '4.50',
  
  -- MediData transmission
  medidata_message_id text, -- Response from MediData
  medidata_transmission_date timestamptz,
  medidata_response_code text,
  medidata_response_message text,
  
  -- Status tracking
  status text check (status in (
    'draft',           -- Invoice created, not sent
    'pending',         -- Sent to MediData, awaiting confirmation
    'transmitted',     -- Confirmed received by MediData
    'delivered',       -- Delivered to insurer
    'accepted',        -- Accepted by insurer
    'partially_paid',  -- Partial payment received
    'paid',            -- Fully paid
    'rejected',        -- Rejected by insurer
    'disputed',        -- Under dispute
    'reminder_1',      -- First reminder sent
    'reminder_2',      -- Second reminder sent
    'reminder_3',      -- Third reminder sent
    'collection',      -- Sent to collection
    'cancelled'        -- Cancelled/voided
  )) not null default 'draft',
  
  -- Insurance response
  insurance_response_date timestamptz,
  insurance_response_code text,
  insurance_response_message text,
  insurance_paid_amount numeric(12, 2),
  insurance_paid_date date,
  
  -- Patient portion (for Tiers Garant)
  patient_portion_amount numeric(12, 2),
  patient_portion_paid boolean default false,
  patient_portion_paid_date date,
  
  -- Metadata
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists medidata_submissions_consultation_id_idx on medidata_submissions(consultation_id);
create index if not exists medidata_submissions_patient_id_idx on medidata_submissions(patient_id);
create index if not exists medidata_submissions_insurer_id_idx on medidata_submissions(insurer_id);
create index if not exists medidata_submissions_status_idx on medidata_submissions(status);
create index if not exists medidata_submissions_invoice_number_idx on medidata_submissions(invoice_number);

-- MediData submission status history
create table if not exists medidata_submission_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references medidata_submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  response_code text,
  response_message text,
  changed_by uuid references users(id),
  created_at timestamptz default now()
);

create index if not exists medidata_submission_history_submission_id_idx on medidata_submission_history(submission_id);

-- MediData configuration for the clinic
create table if not exists medidata_config (
  id uuid primary key default gen_random_uuid(),
  clinic_gln text not null, -- Clinic's GLN
  clinic_zsr text not null, -- ZSR number (Zahlstellenregister)
  clinic_name text not null,
  clinic_address_street text,
  clinic_address_postal_code text,
  clinic_address_city text,
  clinic_canton text,
  medidata_client_id text,
  medidata_username text,
  medidata_password_encrypted text,
  medidata_endpoint_url text default 'https://medidata.ch/md/ela',
  is_test_mode boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Provider GLN mapping (doctors)
alter table if exists providers
  add column if not exists gln text,
  add column if not exists zsr text;

-- ============================================
-- DOCUMENT TEMPLATES SYSTEM
-- ============================================

-- Document templates metadata (files stored in Supabase storage 'templates' bucket)
create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  file_path text not null, -- Path in templates bucket
  file_type text not null default 'docx', -- docx, pdf, etc.
  category text, -- e.g., 'post_op', 'consent', 'report'
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists document_templates_name_idx on document_templates(name);
create index if not exists document_templates_category_idx on document_templates(category);

-- Patient documents (created from templates or blank)
create table if not exists patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  template_id uuid references document_templates(id) on delete set null,
  title text not null,
  content text, -- HTML/rich text content
  status text check (status in ('draft', 'final', 'signed', 'archived')) not null default 'draft',
  file_path text, -- Path to saved PDF/docx in storage
  version integer not null default 1,
  created_by uuid references users(id),
  created_by_name text,
  last_edited_by uuid references users(id),
  last_edited_at timestamptz,
  signed_at timestamptz,
  signed_by_patient boolean default false,
  signed_by_doctor boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists patient_documents_patient_id_idx on patient_documents(patient_id);
create index if not exists patient_documents_template_id_idx on patient_documents(template_id);
create index if not exists patient_documents_status_idx on patient_documents(status);

-- Document version history for audit trail
create table if not exists patient_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references patient_documents(id) on delete cascade,
  version integer not null,
  content text,
  changed_by uuid references users(id),
  changed_by_name text,
  created_at timestamptz default now()
);

create index if not exists patient_document_versions_document_id_idx on patient_document_versions(document_id);

-- External laboratories for settings
create table if not exists external_labs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  username text not null,
  password text not null,
  type text not null default 'medisupport_fr',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-doctor scheduling settings (time slot interval & default duration)
create table if not exists doctor_scheduling_settings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique,
  time_interval_minutes integer not null default 15,
  default_duration_minutes integer not null default 15,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists doctor_scheduling_settings_provider_id_idx on doctor_scheduling_settings(provider_id);
