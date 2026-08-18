-- ============================================================
-- Fix a widespread RLS performance anti-pattern: every "demo isolation"
-- policy called `is_current_user_demo()` directly in its USING clause.
-- Postgres cannot always hoist a bare function call like that into an
-- InitPlan (evaluated once per statement) — depending on the query shape it
-- gets re-evaluated for EVERY ROW scanned, and the function itself does a
-- `SELECT is_demo FROM users WHERE id = auth.uid()` lookup each time.
--
-- Confirmed via EXPLAIN ANALYZE: a full scan of `invoices` (47k rows) as
-- the `anon` role took ~5s with the bare call vs ~25ms once wrapped in
-- `(SELECT is_current_user_demo())`, which Postgres correctly hoists into
-- a one-time InitPlan. This is the standard Supabase/Postgres RLS
-- performance guidance (https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--
-- This changes NOTHING about access control — it's the exact same boolean
-- predicate, just evaluated once per query instead of once per row.
-- ============================================================

ALTER POLICY appointments_demo_isolation ON appointments
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY chat_conversations_demo_isolation ON chat_conversations
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY chat_messages_demo_isolation ON chat_messages
  USING (EXISTS (
    SELECT 1 FROM chat_conversations
    WHERE chat_conversations.id = chat_messages.conversation_id
      AND chat_conversations.is_demo = (SELECT is_current_user_demo())
  ));

ALTER POLICY consultations_demo_isolation ON consultations
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY deal_stages_demo_isolation ON deal_stages
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY deals_demo_isolation ON deals
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY documents_demo_isolation ON documents
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY email_templates_demo_isolation ON email_templates
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY emails_demo_isolation ON emails
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY invoice_line_items_access ON invoice_line_items
  USING (EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.is_demo = (SELECT is_current_user_demo())
  ));

ALTER POLICY invoice_payments_access ON invoice_payments
  USING (EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_payments.invoice_id
      AND invoices.is_demo = (SELECT is_current_user_demo())
  ));

ALTER POLICY invoices_demo_isolation ON invoices
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY patient_notes_demo_isolation ON patient_notes
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY patients_demo_isolation ON patients
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY providers_demo_isolation ON providers
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY tasks_demo_isolation ON tasks
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY whatsapp_messages_demo_isolation ON whatsapp_messages
  USING (is_demo = (SELECT is_current_user_demo()));

ALTER POLICY workflows_demo_isolation ON workflows
  USING (is_demo = (SELECT is_current_user_demo()));
