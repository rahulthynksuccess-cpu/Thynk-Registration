-- ================================================================
-- Thynk SaaS — Multi-tenant school admission platform
-- Migration: 001_init.sql
-- Run in: Supabase Dashboard → SQL Editor
-- ================================================================

-- ── schools ──────────────────────────────────────────────────────
create table if not exists schools (
  id             uuid primary key default gen_random_uuid(),
  school_code    text unique not null,
  name           text not null,
  org_name       text not null,
  logo_url       text,
  branding       jsonb not null default '{}'::jsonb,
  -- branding shape: { primaryColor, accentColor, redirectURL, programDescription }
  gateway_config jsonb not null default '{}'::jsonb,
  -- gateway_config shape: { rzp_key_id, rzp_key_secret, cf_app_id, cf_secret, eb_key, eb_salt }
  -- NOTE: store actual secrets only in Supabase Vault or env; use this for key IDs only
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── pricing ───────────────────────────────────────────────────────
create table if not exists pricing (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  program_name     text not null,
  base_amount      integer not null,          -- in paise (INR) e.g. 120000 = ₹1200
  currency         text not null default 'INR',
  gateway_sequence text[] not null default array['cf','rzp','eb'],
  is_active        boolean not null default true,
  valid_from       timestamptz not null default now(),
  valid_until      timestamptz,
  created_at       timestamptz not null default now()
);

-- ── discount_codes ────────────────────────────────────────────────
create table if not exists discount_codes (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  code            text not null,
  discount_amount integer not null,            -- in paise
  max_uses        integer,                     -- null = unlimited
  used_count      integer not null default 0,
  is_active       boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique(school_id, code)
);

-- ── registrations ─────────────────────────────────────────────────
create table if not exists registrations (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id),
  pricing_id     uuid references pricing(id),
  student_name   text not null,
  class_grade    text not null,
  gender         text not null,
  parent_school  text not null,               -- student's current school name
  city           text not null,
  parent_name    text not null,
  contact_phone  text not null,
  contact_email  text not null,
  status         text not null default 'pending'
                   check (status in ('pending','paid','failed','cancelled','initiated')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── payments ──────────────────────────────────────────────────────
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references registrations(id),
  school_id        uuid not null references schools(id),
  gateway          text not null check (gateway in ('razorpay','cashfree','easebuzz')),
  gateway_txn_id   text,
  base_amount      integer not null,           -- in paise
  discount_amount  integer not null default 0, -- in paise
  final_amount     integer not null,           -- in paise
  discount_code    text,
  status           text not null default 'pending'
                     check (status in ('pending','paid','failed','cancelled','initiated')),
  gateway_response jsonb,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── admin_roles ───────────────────────────────────────────────────
create table if not exists admin_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  school_id  uuid references schools(id) on delete cascade,
  -- school_id = NULL means super_admin (access to all schools)
  role       text not null check (role in ('super_admin','school_admin')),
  created_at timestamptz not null default now(),
  unique(user_id, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- ── Indexes ───────────────────────────────────────────────────────
create index if not exists idx_registrations_school_created
  on registrations(school_id, created_at desc);

create index if not exists idx_registrations_status
  on registrations(school_id, status);

create index if not exists idx_payments_school_status
  on payments(school_id, status);

create index if not exists idx_payments_registration
  on payments(registration_id);

create index if not exists idx_discount_codes_lookup
  on discount_codes(school_id, code, is_active);

create index if not exists idx_admin_roles_user
  on admin_roles(user_id);

-- ── updated_at triggers ───────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_schools_updated_at
  before update on schools
  for each row execute function update_updated_at();

create trigger trg_registrations_updated_at
  before update on registrations
  for each row execute function update_updated_at();

create trigger trg_payments_updated_at
  before update on payments
  for each row execute function update_updated_at();

-- ── Discount usage function (called from server after payment) ───
create or replace function decrement_discount_usage(p_payment_id uuid)
returns void language plpgsql security definer as $$
declare
  v_code    text;
  v_school  uuid;
begin
  select discount_code, school_id
  into   v_code, v_school
  from   payments
  where  id = p_payment_id and discount_code is not null;

  if v_code is not null then
    update discount_codes
    set    used_count = used_count + 1
    where  school_id = v_school and code = v_code;
  end if;
end;
$$;

-- ── Row Level Security ────────────────────────────────────────────
alter table registrations enable row level security;
alter table payments       enable row level security;
alter table schools        enable row level security;
alter table admin_roles    enable row level security;
alter table discount_codes enable row level security;
alter table pricing        enable row level security;

-- Helper: check if calling user is super admin
create or replace function is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from admin_roles
    where user_id = auth.uid()
      and role = 'super_admin'
      and school_id is null
  );
$$;

-- Helper: get school IDs accessible by calling user
create or replace function accessible_school_ids()
returns setof uuid language sql security definer stable as $$
  select school_id
  from   admin_roles
  where  user_id = auth.uid()
    and  school_id is not null
  union
  select id from schools where is_super_admin();
$$;

-- schools: super admin sees all; school admin sees their own
create policy "schools_select" on schools for select
  using (id in (select accessible_school_ids()) or is_super_admin());

create policy "schools_insert" on schools for insert
  with check (is_super_admin());

create policy "schools_update" on schools for update
  using (is_super_admin());

-- registrations: scoped by school
create policy "registrations_select" on registrations for select
  using (school_id in (select accessible_school_ids()));

-- Allow anonymous inserts for public registration form (server-side only via service role)
-- Public inserts go through the API route using service role key, not anon key

-- payments: scoped by school
create policy "payments_select" on payments for select
  using (school_id in (select accessible_school_ids()));

-- pricing: readable by anyone (needed for public registration page)
create policy "pricing_public_select" on pricing for select
  using (is_active = true);

create policy "pricing_admin_all" on pricing for all
  using (school_id in (select accessible_school_ids()));

-- discount_codes: admins only
create policy "discount_codes_select" on discount_codes for select
  using (school_id in (select accessible_school_ids()));

-- admin_roles: users see their own; super admin sees all
create policy "admin_roles_select" on admin_roles for select
  using (user_id = auth.uid() or is_super_admin());

create policy "admin_roles_insert" on admin_roles for insert
  with check (is_super_admin());
