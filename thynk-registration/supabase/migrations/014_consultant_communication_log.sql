-- 014_consultant_communication_log.sql
-- Adds consultant-scoped logging to notification_logs so admin staff can see
-- a full history of emails/WhatsApp messages sent to consultants (independent
-- of any school), including who sent it.

alter table public.notification_logs
  add column if not exists consultant_id uuid references auth.users(id) on delete set null;

alter table public.notification_logs
  add column if not exists sent_by_name text;

alter table public.notification_logs
  add column if not exists template_name text;

-- school_id was already nullable, so consultant-only sends (no school context)
-- can now be logged with school_id = null and consultant_id set instead.

create index if not exists idx_notification_logs_consultant_created
  on public.notification_logs (consultant_id, created_at desc);
