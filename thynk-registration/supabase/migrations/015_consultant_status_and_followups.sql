-- 015_consultant_status_and_followups.sql
-- Adds:
--   1. An approve/reject workflow status on consultant_profiles that is
--      independent of the one-shot consultant_registrations queue, so a
--      consultant who has already been approved (and has a live login) can
--      still be rejected/deactivated later — and restored if needed.
--   2. Follow-up tracking for both consultants and schools: a "next follow-up
--      date" plus cached "last follow-up" fields for quick display in lists,
--      backed by a full history table (followups) so every comment, its
--      date/time and the admin user who logged it is preserved.

-- ── 1. Consultant approval status (approved / rejected) ──────────────────────
alter table public.consultant_profiles
  add column if not exists status text not null default 'approved';

alter table public.consultant_profiles
  drop constraint if exists consultant_profiles_status_check;

alter table public.consultant_profiles
  add constraint consultant_profiles_status_check
  check (status in ('approved', 'rejected'));

alter table public.consultant_profiles
  add column if not exists rejected_at        timestamptz,
  add column if not exists rejected_by_name   text,
  add column if not exists reject_reason      text;

create index if not exists idx_consultant_profiles_status
  on public.consultant_profiles (status);

-- ── 2. Follow-up cache columns ────────────────────────────────────────────────
alter table public.consultant_profiles
  add column if not exists next_followup_date   date,
  add column if not exists last_followup_at     timestamptz,
  add column if not exists last_followup_comment text,
  add column if not exists last_followup_by     text;

alter table public.schools
  add column if not exists next_followup_date   date,
  add column if not exists last_followup_at     timestamptz,
  add column if not exists last_followup_comment text,
  add column if not exists last_followup_by     text;

create index if not exists idx_consultant_profiles_next_followup
  on public.consultant_profiles (next_followup_date);
create index if not exists idx_schools_next_followup
  on public.schools (next_followup_date);

-- ── 3. Follow-up history table (shared by consultants + schools) ─────────────
create table if not exists public.followups (
  id                 uuid primary key default gen_random_uuid(),
  entity_type        text not null check (entity_type in ('consultant', 'school')),
  entity_id          uuid not null,
  comment            text,
  next_followup_date date,
  created_by         uuid references auth.users(id) on delete set null,
  created_by_name    text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_followups_entity
  on public.followups (entity_type, entity_id, created_at desc);

alter table public.followups enable row level security;

-- Service role (used exclusively by the admin API routes) bypasses RLS by
-- default, so this policy just makes sure no other role can read/write.
drop policy if exists followups_service_only on public.followups;
create policy followups_service_only on public.followups
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
