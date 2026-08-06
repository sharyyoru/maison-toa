-- Workflow engine v2: immutable definitions, durable execution, and canonical CRM state.
-- This migration is additive. Legacy workflows/config and executors remain available during cutover.

CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  graph jsonb NOT NULL DEFAULT '{"schemaVersion":2,"nodes":[],"edges":[]}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (workflow_id, version)
);

-- The v1 enum cannot evolve transactionally with the administrator-managed catalogue.
ALTER TABLE workflows ALTER COLUMN trigger_type TYPE text USING trigger_type::text;

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS published_version_id uuid REFERENCES workflow_versions(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS draft_version_id uuid REFERENCES workflow_versions(id) ON DELETE SET NULL;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS engine_version integer NOT NULL DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS migration_status text NOT NULL DEFAULT 'legacy'
  CHECK (migration_status IN ('legacy', 'shadow', 'ready', 'live', 'needs_review'));
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE emails ADD COLUMN IF NOT EXISTS workflow_idempotency_key text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_one_draft_idx ON workflow_versions(workflow_id) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS workflow_versions_workflow_idx ON workflow_versions(workflow_id, version DESC);

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'shadowed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_events_pending_idx ON workflow_events(status, available_at, occurred_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS workflow_events_patient_idx ON workflow_events(patient_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workflow_runs_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES workflow_events(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled', 'stopped', 'shadow')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, event_id)
);

CREATE INDEX IF NOT EXISTS workflow_runs_v2_workflow_idx ON workflow_runs_v2(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_v2_patient_idx ON workflow_runs_v2(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_v2_status_idx ON workflow_runs_v2(status, created_at);

CREATE TABLE IF NOT EXISTS workflow_step_runs_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs_v2(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  branch text CHECK (branch IN ('next', 'yes', 'no')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0,
  reached_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  executed_at timestamptz,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_step_runs_v2_run_idx ON workflow_step_runs_v2(run_id, created_at);

CREATE TABLE IF NOT EXISTS workflow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('process_event', 'execute_node', 'scheduled_trigger')),
  event_id uuid REFERENCES workflow_events(id) ON DELETE CASCADE,
  run_id uuid REFERENCES workflow_runs_v2(id) ON DELETE CASCADE,
  node_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_jobs_claim_idx ON workflow_jobs(status, available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION enqueue_workflow_event_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO workflow_jobs(job_type, event_id, idempotency_key)
  VALUES ('process_event', NEW.id, 'event:' || NEW.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS workflow_events_enqueue_job ON workflow_events;
CREATE TRIGGER workflow_events_enqueue_job AFTER INSERT ON workflow_events
FOR EACH ROW EXECUTE FUNCTION enqueue_workflow_event_job();

CREATE OR REPLACE FUNCTION emit_workflow_event(
  p_type text, p_subject_type text, p_subject_id text, p_patient_id uuid,
  p_payload jsonb, p_dedupe_key text, p_occurred_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_id uuid;
BEGIN
  INSERT INTO workflow_events(event_type, subject_type, subject_id, patient_id, payload, dedupe_key, occurred_at)
  VALUES (p_type, p_subject_type, p_subject_id, p_patient_id, COALESCE(p_payload, '{}'::jsonb), p_dedupe_key, p_occurred_at)
  ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION emit_workflow_event(text,text,text,uuid,jsonb,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION emit_workflow_event(text,text,text,uuid,jsonb,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION patient_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_workflow_event('patient_created','patient',NEW.id::text,NEW.id,to_jsonb(NEW),'patient_created:'||NEW.id::text,COALESCE(NEW.created_at,now()));
  ELSE
    PERFORM emit_workflow_event('patient_updated','patient',NEW.id::text,NEW.id,to_jsonb(NEW),'patient_updated:'||NEW.id::text||':'||txid_current()::text,now());
    IF OLD.is_vip IS DISTINCT FROM NEW.is_vip THEN
      PERFORM emit_workflow_event(CASE WHEN NEW.is_vip THEN 'vip_activated' ELSE 'vip_removed' END,'patient',NEW.id::text,NEW.id,jsonb_build_object('is_vip',NEW.is_vip),'vip:'||NEW.id::text||':'||txid_current()::text,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patients_workflow_events ON patients;
CREATE TRIGGER patients_workflow_events AFTER INSERT OR UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION patient_workflow_events();

CREATE OR REPLACE FUNCTION appointment_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_workflow_event('appointment_created','appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'appointment_created:'||NEW.id::text,COALESCE(NEW.created_at,now()));
    IF NEW.start_time > now() THEN
      PERFORM emit_workflow_event('future_appointment_created','appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'future_appointment_created:'||NEW.id::text,COALESCE(NEW.created_at,now()));
    END IF;
    IF NEW.patient_id IS NOT NULL AND (SELECT count(*) FROM appointments WHERE patient_id = NEW.patient_id) = 1 THEN
      PERFORM emit_workflow_event('first_appointment','appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'first_appointment:'||NEW.id::text,COALESCE(NEW.created_at,now()));
    END IF;
  ELSE
    PERFORM emit_workflow_event('appointment_updated','appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'appointment_updated:'||NEW.id::text||':'||txid_current()::text,now());
    IF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
      PERFORM emit_workflow_event('appointment_rescheduled','appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'appointment_rescheduled:'||NEW.id::text||':'||txid_current()::text,now());
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      event_name := CASE NEW.status::text WHEN 'cancelled' THEN 'appointment_cancelled' WHEN 'completed' THEN 'appointment_completed' WHEN 'no_show' THEN 'appointment_no_show' WHEN 'confirmed' THEN 'appointment_confirmed' ELSE NULL END;
      IF event_name IS NOT NULL THEN
        PERFORM emit_workflow_event(event_name,'appointment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text||':'||txid_current()::text,now());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS appointments_workflow_events ON appointments;
CREATE TRIGGER appointments_workflow_events AFTER INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION appointment_workflow_events();

CREATE OR REPLACE FUNCTION invoice_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_workflow_event('invoice_created','invoice',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'invoice_created:'||NEW.id::text,COALESCE(NEW.created_at,now()));
  ELSIF (OLD.status IS DISTINCT FROM NEW.status OR OLD.paid_amount IS DISTINCT FROM NEW.paid_amount)
    AND (NEW.status = 'paid' OR COALESCE(NEW.paid_amount,0) >= COALESCE(NEW.total_amount,0)) THEN
    PERFORM emit_workflow_event('invoice_paid','invoice',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'invoice_paid:'||NEW.id::text,now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invoices_workflow_events ON invoices;
CREATE TRIGGER invoices_workflow_events AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION invoice_workflow_events();

-- Channel consent is auditable rather than a mutable boolean without provenance.
CREATE TABLE IF NOT EXISTS patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email_marketing', 'sms_marketing', 'social_media')),
  granted boolean NOT NULL,
  source text,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS patient_consents_latest_idx ON patient_consents(patient_id, channel, changed_at DESC);

CREATE OR REPLACE FUNCTION consent_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  event_name := CASE NEW.channel WHEN 'email_marketing' THEN 'marketing_consent_changed' WHEN 'social_media' THEN 'social_media_consent_changed' ELSE NULL END;
  IF event_name IS NOT NULL THEN
    PERFORM emit_workflow_event(event_name,'patient_consent',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text,NEW.changed_at);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_consents_workflow_events ON patient_consents;
CREATE TRIGGER patient_consents_workflow_events AFTER INSERT ON patient_consents FOR EACH ROW EXECUTE FUNCTION consent_workflow_events();

CREATE TABLE IF NOT EXISTS patient_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS patient_tag_assignments (
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES patient_tags(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, tag_id)
);

CREATE TABLE IF NOT EXISTS patient_property_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('text', 'number', 'boolean', 'date', 'single_select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS patient_property_values (
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES patient_property_definitions(id) ON DELETE CASCADE,
  value jsonb NOT NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, definition_id)
);

CREATE TABLE IF NOT EXISTS patient_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  treatment_name text NOT NULL,
  treatment_category text,
  practitioner_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('performed', 'completed', 'cancelled')),
  performed_at timestamptz NOT NULL,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_treatments_history_idx ON patient_treatments(patient_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS patient_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'accepted', 'declined', 'expired')),
  total_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE TABLE IF NOT EXISTS patient_surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  category text,
  status text NOT NULL CHECK (status IN ('consultation_completed', 'scheduled', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  total_sessions integer NOT NULL CHECK (total_sessions > 0),
  used_sessions integer NOT NULL DEFAULT 0 CHECK (used_sessions >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  CHECK (used_sessions <= total_sessions)
);

CREATE TABLE IF NOT EXISTS patient_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'refunded', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_deposits_patient_idx ON patient_deposits(patient_id, status);

CREATE TABLE IF NOT EXISTS patient_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  membership_type text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at timestamptz NOT NULL,
  renews_at timestamptz,
  expires_at timestamptz,
  renewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_memberships_patient_idx ON patient_memberships(patient_id, status);

CREATE TABLE IF NOT EXISTS workflow_staff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES workflow_runs_v2(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_staff_notifications_recipient_idx ON workflow_staff_notifications(recipient_user_id, read_at, created_at DESC);

CREATE OR REPLACE FUNCTION treatment_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  event_name := CASE NEW.status WHEN 'performed' THEN 'treatment_performed' WHEN 'completed' THEN 'treatment_completed' ELSE NULL END;
  IF event_name IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM emit_workflow_event(event_name,'treatment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text,COALESCE(NEW.completed_at,NEW.performed_at));
    IF NEW.status = 'completed' AND NEW.treatment_category IS NOT NULL THEN
      PERFORM emit_workflow_event('treatment_category_completed','treatment',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'treatment_category_completed:'||NEW.id::text,COALESCE(NEW.completed_at,NEW.performed_at));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_treatments_workflow_events ON patient_treatments;
CREATE TRIGGER patient_treatments_workflow_events AFTER INSERT OR UPDATE ON patient_treatments FOR EACH ROW EXECUTE FUNCTION treatment_workflow_events();

CREATE OR REPLACE FUNCTION quote_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  event_name := CASE NEW.status WHEN 'created' THEN 'quote_created' WHEN 'accepted' THEN 'quote_accepted' WHEN 'declined' THEN 'quote_declined' ELSE NULL END;
  IF event_name IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM emit_workflow_event(event_name,'quote',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text,COALESCE(NEW.responded_at,NEW.created_at));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_quotes_workflow_events ON patient_quotes;
CREATE TRIGGER patient_quotes_workflow_events AFTER INSERT OR UPDATE ON patient_quotes FOR EACH ROW EXECUTE FUNCTION quote_workflow_events();

CREATE OR REPLACE FUNCTION surgery_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  event_name := CASE NEW.status WHEN 'consultation_completed' THEN 'surgery_consultation_completed' WHEN 'scheduled' THEN 'surgery_scheduled' WHEN 'completed' THEN 'surgery_completed' WHEN 'cancelled' THEN 'surgery_cancelled' END;
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM emit_workflow_event(event_name,'surgery',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text||':'||NEW.status,now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_surgeries_workflow_events ON patient_surgeries;
CREATE TRIGGER patient_surgeries_workflow_events AFTER INSERT OR UPDATE ON patient_surgeries FOR EACH ROW EXECUTE FUNCTION surgery_workflow_events();

CREATE OR REPLACE FUNCTION package_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_workflow_event('package_purchased','package',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'package_purchased:'||NEW.id::text,NEW.purchased_at);
  ELSE
    IF OLD.used_sessions IS DISTINCT FROM NEW.used_sessions THEN
      PERFORM emit_workflow_event('remaining_sessions','package',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'remaining_sessions:'||NEW.id::text||':'||(NEW.total_sessions-NEW.used_sessions)::text,now());
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
      PERFORM emit_workflow_event('package_completed','package',NEW.id::text,NEW.patient_id,to_jsonb(NEW),'package_completed:'||NEW.id::text,COALESCE(NEW.completed_at,now()));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_packages_workflow_events ON patient_packages;
CREATE TRIGGER patient_packages_workflow_events AFTER INSERT OR UPDATE ON patient_packages FOR EACH ROW EXECUTE FUNCTION package_workflow_events();

CREATE OR REPLACE FUNCTION deposit_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN event_name := 'deposit_requested';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    event_name := CASE NEW.status WHEN 'paid' THEN 'deposit_paid' WHEN 'refunded' THEN 'deposit_refunded' ELSE NULL END;
  END IF;
  IF event_name IS NOT NULL THEN
    PERFORM emit_workflow_event(event_name,'deposit',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text,COALESCE(NEW.refunded_at,NEW.paid_at,NEW.requested_at));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_deposits_workflow_events ON patient_deposits;
CREATE TRIGGER patient_deposits_workflow_events AFTER INSERT OR UPDATE ON patient_deposits FOR EACH ROW EXECUTE FUNCTION deposit_workflow_events();

CREATE OR REPLACE FUNCTION membership_workflow_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN event_name := 'membership_purchased';
  ELSIF OLD.renewed_at IS DISTINCT FROM NEW.renewed_at AND NEW.renewed_at IS NOT NULL THEN event_name := 'membership_renewed';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active' THEN event_name := 'membership_activated';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'expired' THEN event_name := 'membership_expired';
  END IF;
  IF event_name IS NOT NULL THEN
    PERFORM emit_workflow_event(event_name,'membership',NEW.id::text,NEW.patient_id,to_jsonb(NEW),event_name||':'||NEW.id::text||':'||COALESCE(NEW.renewed_at::text,NEW.status),now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_memberships_workflow_events ON patient_memberships;
CREATE TRIGGER patient_memberships_workflow_events AFTER INSERT OR UPDATE ON patient_memberships FOR EACH ROW EXECUTE FUNCTION membership_workflow_events();

-- Atomic queue claim with stale-lock recovery. Service role only.
CREATE OR REPLACE FUNCTION claim_workflow_jobs(p_worker_id text, p_limit integer DEFAULT 25)
RETURNS SETOF workflow_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM workflow_jobs
    WHERE available_at <= now()
      AND attempts < max_attempts
      AND (status IN ('pending', 'failed') OR (status = 'running' AND locked_at < now() - interval '10 minutes'))
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE workflow_jobs j
  SET status = 'running', locked_at = now(), locked_by = p_worker_id,
      attempts = j.attempts + 1, updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION claim_workflow_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_workflow_jobs(text, integer) TO service_role;

-- Authenticated users can read execution history; mutation remains server-side.
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_runs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_property_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_property_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_staff_notifications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workflow_versions','workflow_runs_v2','workflow_step_runs_v2','patient_consents','patient_tags',
    'patient_tag_assignments','patient_property_definitions','patient_property_values','patient_treatments',
    'patient_quotes','patient_surgeries','patient_packages','patient_deposits','patient_memberships','workflow_staff_notifications'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Authenticated read ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'Authenticated read ' || table_name, table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Authenticated read workflows" ON workflows;
CREATE POLICY "Authenticated read workflows" ON workflows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins insert workflows" ON workflows;
CREATE POLICY "Admins insert workflows" ON workflows FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
DROP POLICY IF EXISTS "Admins update workflows" ON workflows;
CREATE POLICY "Admins update workflows" ON workflows FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
DROP POLICY IF EXISTS "Admins delete workflows" ON workflows;
CREATE POLICY "Admins delete workflows" ON workflows FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
