-- ================================================================
-- Thynk SaaS — Migration 003: Sub-Admin Role with Page & School Permissions
-- Run AFTER 002_saas_upgrade.sql in Supabase SQL Editor
-- All changes are ADDITIVE — no existing data is affected
-- ================================================================

-- ── 1. Extend admin_roles to support sub_admin role ──────────────
-- Drop the old check constraint that only allowed super_admin / school_admin
alter table admin_roles
  drop constraint if exists admin_roles_role_check;

-- Re-add with sub_admin included
alter table admin_roles
  add constraint admin_roles_role_check
  check (role in ('super_admin', 'school_admin', 'sub_admin'));

-- ── 2. Add permission columns ────────────────────────────────────
-- allowed_pages: null = all pages (for super_admin / school_admin),
--                array of page IDs for sub_admin
alter table admin_roles
  add column if not exists allowed_pages  text[]  default null;

-- all_schools: true = can see all schools (like super_admin but page-restricted)
--              false/null = scoped to school_id only
alter table admin_roles
  add column if not exists all_schools    boolean not null default false;

-- name: friendly label for the sub-admin user
alter table admin_roles
  add column if not exists display_name   text    default null;

-- ── 3. Index for fast permission lookups ─────────────────────────
create index if not exists idx_admin_roles_user_role
  on admin_roles(user_id, role);

-- ── 4. Helper function: get accessible school IDs for any role ───
-- Replaces the simpler version from 001_init.sql
create or replace function accessible_school_ids()
returns setof uuid language sql security definer stable as $$
  select id from schools
  where is_super_admin()
  union
  select school_id
  from   admin_roles
  where  user_id = auth.uid()
    and  school_id is not null
    and  role in ('school_admin', 'sub_admin')
  union
  -- sub_admin with all_schools = true gets every school
  select id from schools
  where exists (
    select 1 from admin_roles
    where  user_id    = auth.uid()
      and  role       = 'sub_admin'
      and  all_schools = true
  );
$$;

-- ── 5. Helper: check if user is sub_admin ────────────────────────
create or replace function is_sub_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from admin_roles
    where user_id = auth.uid()
      and role    = 'sub_admin'
  );
$$;

-- ── 6. RLS: sub_admin can read admin_roles (their own rows) ──────
-- Existing policy from 001 already covers: user_id = auth.uid() or is_super_admin()
-- No change needed — sub_admin can already read their own row.

-- ── 7. Convenience view: sub_admin permissions per user ──────────
create or replace view sub_admin_permissions as
  select
    ar.user_id,
    au.email,
    ar.display_name,
    ar.allowed_pages,
    ar.all_schools,
    array_agg(ar.school_id) filter (where ar.school_id is not null) as school_ids,
    array_agg(s.name)       filter (where s.name is not null)       as school_names
  from admin_roles ar
  left join auth.users au on au.id = ar.user_id
  left join schools s     on s.id  = ar.school_id
  where ar.role = 'sub_admin'
  group by ar.user_id, au.email, ar.display_name, ar.allowed_pages, ar.all_schools;
