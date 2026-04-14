-- ================================================================
-- Thynk SaaS — Migration 002: Multi-project SaaS upgrade
-- Run AFTER 001_init.sql in Supabase SQL Editor
-- All changes are ADDITIVE — no existing data is affected
-- ================================================================

-- ── projects ─────────────────────────────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  domain      text,
  status      text not null default 'active'
                check (status in ('active','inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- ── Add project_id to schools ────────────────────────────────────
alter table schools
  add column if not exists project_id uuid references projects(id) on delete set null;

-- ── integration_configs ──────────────────────────────────────────
-- Replaces the gateway_config jsonb blob on schools
-- NULL school_id = global / super-admin default
create table if not exists integration_configs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools(id) on delete cascade,
  provider    text not null,
  -- 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal'
  -- 'smtp' | 'sendgrid' | 'aws_ses'
  -- 'whatsapp_cloud' | 'twilio'
  config      jsonb not null default '{}'::jsonb,
  -- Key IDs only — secrets go in Supabase Vault / env vars
  priority    int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(school_id, provider)
);

create trigger trg_integration_configs_updated_at
  before update on integration_configs
  for each row execute function update_updated_at();

create index if not exists idx_integration_configs_school
  on integration_configs(school_id, is_active, priority);

-- ── notification_templates ───────────────────────────────────────
create table if not exists notification_templates (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools(id) on delete cascade,
  channel     text not null check (channel in ('email','whatsapp')),
  name        text not null,
  subject     text,            -- email only
  body        text not null,   -- supports {{variable}} placeholders
  variables   jsonb not null default '[]'::jsonb,
  -- list of variable names available, e.g. ["student_name","amount"]
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_notification_templates_updated_at
  before update on notification_templates
  for each row execute function update_updated_at();

-- ── notification_triggers ────────────────────────────────────────
create table if not exists notification_triggers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools(id) on delete cascade,
  event_type  text not null
                check (event_type in (
                  'registration.created',
                  'payment.paid',
                  'payment.failed',
                  'payment.cancelled',
                  'discount.applied',
                  'school.registered',
                  'school.approved'
                )),
  channel     text not null check (channel in ('email','whatsapp')),
  template_id uuid references notification_templates(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_notification_triggers_updated_at
  before update on notification_triggers
  for each row execute function update_updated_at();

create index if not exists idx_notification_triggers_school_event
  on notification_triggers(school_id, event_type, is_active);

-- ── notification_logs ────────────────────────────────────────────
create table if not exists notification_logs (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id) on delete set null,
  school_id       uuid references schools(id) on delete set null,
  trigger_id      uuid references notification_triggers(id) on delete set null,
  channel         text not null,
  provider        text not null,
  recipient       text not null,   -- email address or phone number
  status          text not null default 'pending'
                    check (status in ('pending','sent','failed')),
  provider_response jsonb,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notification_logs_registration
  on notification_logs(registration_id);

create index if not exists idx_notification_logs_school_created
  on notification_logs(school_id, created_at desc);

-- ── activity_logs ────────────────────────────────────────────────
create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  school_id   uuid references schools(id) on delete set null,
  action      text not null,      -- e.g. 'school.created', 'pricing.updated'
  entity_type text,               -- 'school' | 'pricing' | 'discount' | etc.
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_logs_user
  on activity_logs(user_id, created_at desc);

create index if not exists idx_activity_logs_school
  on activity_logs(school_id, created_at desc);

-- ── Extend discount_codes with percentage support ─────────────────
alter table discount_codes
  add column if not exists discount_type  text not null default 'fixed'
    check (discount_type in ('fixed','percent')),
  add column if not exists discount_value int;
-- discount_value: for 'fixed' use paise, for 'percent' use 1-100

-- ── Extend admin_roles with project-level role ───────────────────
alter table admin_roles
  add column if not exists project_id uuid references projects(id) on delete cascade;
-- role: 'project_admin' = access to all schools in a project

-- ── RLS for new tables ───────────────────────────────────────────
alter table projects               enable row level security;
alter table integration_configs    enable row level security;
alter table notification_templates enable row level security;
alter table notification_triggers  enable row level security;
alter table notification_logs      enable row level security;
alter table activity_logs          enable row level security;

-- projects: super admin only
create policy "projects_select" on projects for select
  using (is_super_admin());
create policy "projects_insert" on projects for insert
  with check (is_super_admin());
create policy "projects_update" on projects for update
  using (is_super_admin());

-- integration_configs: school scoped
create policy "integration_configs_select" on integration_configs for select
  using (school_id in (select accessible_school_ids()) or is_super_admin());
create policy "integration_configs_all" on integration_configs for all
  using (school_id in (select accessible_school_ids()) or is_super_admin());

-- notification_templates: school scoped
create policy "notification_templates_select" on notification_templates for select
  using (school_id in (select accessible_school_ids()) or is_super_admin());
create policy "notification_templates_all" on notification_templates for all
  using (school_id in (select accessible_school_ids()) or is_super_admin());

-- notification_triggers: school scoped
create policy "notification_triggers_select" on notification_triggers for select
  using (school_id in (select accessible_school_ids()) or is_super_admin());
create policy "notification_triggers_all" on notification_triggers for all
  using (school_id in (select accessible_school_ids()) or is_super_admin());

-- notification_logs: school scoped
create policy "notification_logs_select" on notification_logs for select
  using (school_id in (select accessible_school_ids()) or is_super_admin());

-- activity_logs: super admin only
create policy "activity_logs_select" on activity_logs for select
  using (is_super_admin());

-- ── Helper: resolve payment gateway config ───────────────────────
-- Used by API routes to get priority-ordered gateway configs
create or replace function get_gateway_configs(p_school_id uuid, p_currency text default 'INR')
returns table (
  provider   text,
  config     jsonb,
  priority   int
) language sql security definer stable as $$
  select ic.provider, ic.config, ic.priority
  from   integration_configs ic
  where  (ic.school_id = p_school_id or ic.school_id is null)
    and  ic.is_active = true
    and  ic.provider in ('razorpay','cashfree','easebuzz','paypal')
    and  (
           (p_currency = 'INR' and ic.provider != 'paypal')
        or (p_currency != 'INR' and ic.provider = 'paypal')
        or ic.provider = 'razorpay'   -- razorpay supports both
         )
  order by ic.school_id nulls last, ic.priority asc;
$$;

-- ── Seed default project ─────────────────────────────────────────
insert into projects (name, slug, status)
values ('Thynk Success', 'thynk-success', 'active')
on conflict (slug) do nothing;

-- Link existing schools to the default project
update schools
set project_id = (select id from projects where slug = 'thynk-success' limit 1)
where project_id is null;
