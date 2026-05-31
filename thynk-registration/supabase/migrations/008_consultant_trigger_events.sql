-- ─────────────────────────────────────────────────────────────────────────────
-- 008_consultant_trigger_events.sql
-- Adds consultant.registered and consultant.approved to the event_type
-- CHECK constraint so triggers can be created/saved for consultant events.
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old constraint (from migration 005) and replace with extended version
ALTER TABLE notification_triggers
  DROP CONSTRAINT IF EXISTS notification_triggers_event_type_check;

ALTER TABLE notification_triggers
  ADD CONSTRAINT notification_triggers_event_type_check
  CHECK (event_type IN (
    -- Student registration events
    'registration.created',
    'payment.paid',
    'payment.failed',
    'payment.cancelled',
    'discount.applied',
    -- School events
    'school.registered',
    'school.approved',
    -- Consultant events (NEW)
    'consultant.registered',
    'consultant.approved'
  ));

-- Index for fast lookup on consultant events (school_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_notif_triggers_consultant_event
  ON notification_triggers(event_type, is_active)
  WHERE event_type IN ('consultant.registered', 'consultant.approved');

-- ── Fix recipient_type check constraint to allow 'consultant' ─────────────────
-- Find and drop the recipient_type constraint (name may vary by Supabase version)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'notification_triggers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%recipient_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE notification_triggers DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- Re-add with 'consultant' included
ALTER TABLE notification_triggers
  ADD CONSTRAINT notification_triggers_recipient_type_check
  CHECK (recipient_type IN ('student', 'school', 'consultant'));
