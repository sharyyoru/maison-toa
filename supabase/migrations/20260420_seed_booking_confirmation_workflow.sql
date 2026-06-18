-- Seed the default "Booking Confirmation + Reminder" workflow.
--
-- This reproduces the existing automatic booking emails as a workflow driven by
-- the `appointment_created` trigger:
--   1. Booking confirmation (built-in branded email) sent immediately.
--   2. Appointment reminder (built-in branded email) sent 24 hours before.
--
-- The booking route triggers /api/workflows/appointment-created. When this
-- workflow is active it owns the patient confirmation + reminder; if it is ever
-- deactivated/deleted the booking route falls back to its hardcoded emails, so
-- confirmations can never silently stop.
--
-- Idempotent: only inserts if a workflow with this name does not already exist.

INSERT INTO workflows (name, trigger_type, active, config)
SELECT
  'Booking Confirmation + Reminder',
  'appointment_created'::workflow_trigger_type,
  true,
  '{
    "nodes": [
      {
        "id": "trigger_booking_confirmation",
        "type": "trigger",
        "data": { "triggerType": "appointment_created", "config": {} },
        "nextNodeId": "action_booking_confirmation"
      },
      {
        "id": "action_booking_confirmation",
        "type": "action",
        "data": {
          "actionType": "send_email",
          "config": {
            "email_type": "appointment_confirmation",
            "recipient": "patient",
            "send_mode": "immediate"
          }
        },
        "nextNodeId": "action_booking_reminder"
      },
      {
        "id": "action_booking_reminder",
        "type": "action",
        "data": {
          "actionType": "send_email",
          "config": {
            "email_type": "appointment_reminder",
            "recipient": "patient",
            "send_mode": "reminder_before",
            "before_value": 24,
            "before_unit": "hours"
          }
        },
        "nextNodeId": null
      }
    ]
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM workflows WHERE name = 'Booking Confirmation + Reminder'
);
