-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: base_url on projects + school dashboard support
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add base_url to projects (allows custom domain per program)
alter table projects
  add column if not exists base_url        text,
  add column if not exists base_amount_inr integer,
  add column if not exists base_amount_usd integer;

-- 2. Backfill base_amount_inr from base_amount for existing INR projects
update projects
  set base_amount_inr = base_amount
  where base_amount_inr is null and (currency = 'INR' or currency is null);

-- 3. Add currency column if it does not exist yet
alter table projects
  add column if not exists currency text not null default 'INR';

-- ─────────────────────────────────────────────────────────────────────────────
-- School dashboard: RLS policies so school_admin can read their own data
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: returns the school_ids the current user is an admin of
create or replace function current_user_school_ids()
returns setof uuid
language sql security definer stable
as $$
  select school_id
  from   admin_roles
  where  user_id  = auth.uid()
    and  school_id is not null;
$$;

-- registrations: allow school_admin to read their own school rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'registrations'
      and policyname = 'registrations_school_admin_select'
  ) then
    create policy "registrations_school_admin_select"
      on registrations for select
      using (
        school_id in (select current_user_school_ids())
        or exists (
          select 1 from admin_roles
          where user_id  = auth.uid()
            and role      = 'super_admin'
            and school_id is null
        )
      );
  end if;
end $$;

-- payments: allow school_admin to read payments for their school
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'payments'
      and policyname = 'payments_school_admin_select'
  ) then
    create policy "payments_school_admin_select"
      on payments for select
      using (
        school_id in (select current_user_school_ids())
        or exists (
          select 1 from admin_roles
          where user_id  = auth.uid()
            and role      = 'super_admin'
            and school_id is null
        )
      );
  end if;
end $$;

-- admin_roles: allow users to read their own role rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'admin_roles'
      and policyname = 'admin_roles_self_select'
  ) then
    create policy "admin_roles_self_select"
      on admin_roles for select
      using (user_id = auth.uid());
  end if;
end $$;
