-- 013_consultant_profile_last_updated.sql
-- Tracks who last updated a consultant's profile (internal remark, association
-- status, contact details, etc.) and when, so admin staff can see accountability
-- on the Approved Consultants list.

alter table public.consultant_profiles
  add column if not exists updated_at timestamptz;

alter table public.consultant_profiles
  add column if not exists updated_by_name text;

create index if not exists idx_consultant_profiles_updated_at
  on public.consultant_profiles (updated_at desc);
