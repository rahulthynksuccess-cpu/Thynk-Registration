-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Fix notification_triggers event_type CHECK constraint
--
-- ROOT CAUSE OF SILENT TRIGGER FAILURE:
--   The original CHECK constraint (migration 002) used underscore format:
--     ('registration_created', 'payment_success', 'payment_failed')
--   But fire.ts queries with dot-notation:
--     'registration.created', 'payment.paid', 'payment.failed', etc.
--
--   Result: The DB query .eq('event_type', event) NEVER matches any row.
--   Triggers appear to "fire" (no error thrown) but find 0 matching rows,
--   so zero emails and zero WhatsApp messages are ever sent.
--
--   Additionally, when the Admin UI tries to INSERT a trigger with
--   event_type = 'registration.created', the CHECK constraint rejects it
--   with a DB error — but the UI may show this as a generic failure.
--
-- FIX: Replace the constraint with dot-notation values that match fire.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop the old constraint
ALTER TABLE notification_triggers
  DROP CONSTRAINT IF EXISTS notification_triggers_event_type_check;

-- Step 2: Migrate any existing rows that used the old underscore format
UPDATE notification_triggers SET event_type = 'registration.created' WHERE event_type = 'registration_created';
UPDATE notification_triggers SET event_type = 'payment.paid'         WHERE event_type = 'payment_success';
UPDATE notification_triggers SET event_type = 'payment.failed'       WHERE event_type = 'payment_failed';

-- Step 3: Add new constraint with dot-notation matching fire.ts TriggerEvent type
ALTER TABLE notification_triggers
  ADD CONSTRAINT notification_triggers_event_type_check
  CHECK (event_type IN (
    'registration.created',
    'payment.paid',
    'payment.failed',
    'payment.cancelled',
    'discount.applied',
    'school.registered',
    'school.approved'
  ));

-- Step 4: Fix the notification_logs recipient column — empty string is allowed
-- (NOT NULL is fine; empty string '' is valid for school-level events with no contact yet)
-- No change needed here.

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY after running:
--   SELECT id, event_type, channel, is_active FROM notification_triggers;
--   -- Should show rows with dot-notation event_type values
-- ─────────────────────────────────────────────────────────────────────────────
