-- 011_consultant_association_status.sql
-- Adds an Associated / Not Associated status field to consultants so admin
-- staff can track which consultants are currently actively engaged.
-- Every existing + new consultant defaults to 'not_associated'.

alter table public.consultant_profiles
  add column if not exists association_status text not null default 'not_associated';

-- Enforce the two allowed values (idempotent — drop old copy of the same
-- constraint first so this migration can be re-run safely).
alter table public.consultant_profiles
  drop constraint if exists consultant_profiles_association_status_check;

alter table public.consultant_profiles
  add constraint consultant_profiles_association_status_check
  check (association_status in ('associated', 'not_associated'));

create index if not exists idx_consultant_profiles_association_status
  on public.consultant_profiles (association_status);
