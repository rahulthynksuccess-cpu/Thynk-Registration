-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Support for dedicated Integrations, Message Triggers
--                and Settings pages
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow platform-level (school_id IS NULL) integration configs
--    The existing unique(school_id, provider) does not catch NULL+NULL duplicates
--    in PostgreSQL (NULLs are not equal). Add a partial unique index for it.
create unique index if not exists idx_integration_configs_global_provider
  on integration_configs (provider)
  where school_id is null;

-- 2. Add 'platform_settings' to allowed providers comment (no constraint needed)
--    (Just documentation — the text column accepts any value)

-- 3. Ensure notification_templates has a 'subject' column (email templates need it)
alter table notification_templates
  add column if not exists subject text;

-- 4. Ensure notification_templates has 'is_active' column
alter table notification_templates
  add column if not exists is_active boolean not null default true;

-- 5. Add 'school_id' scoping to notification_templates if missing
alter table notification_templates
  add column if not exists school_id uuid references schools(id) on delete cascade;

-- 6. Ensure notification_triggers references notification_templates properly
--    (already exists in 002 but guard with IF NOT EXISTS logic)
alter table notification_triggers
  add column if not exists school_id uuid references schools(id) on delete cascade;

alter table notification_triggers
  add column if not exists is_active boolean not null default true;

-- 7. RLS: allow super_admin full access to global integration_configs
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'integration_configs'
      and policyname = 'integration_configs_global_super_admin'
  ) then
    create policy "integration_configs_global_super_admin"
      on integration_configs for all
      using (
        school_id is null
        and exists (
          select 1 from admin_roles
          where user_id  = auth.uid()
            and role      = 'super_admin'
            and school_id is null
        )
      );
  end if;
end $$;

-- 8. RLS: allow super_admin to read/write all notification_templates and triggers
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'notification_templates'
      and policyname = 'notification_templates_super_admin'
  ) then
    create policy "notification_templates_super_admin"
      on notification_templates for all
      using (
        exists (
          select 1 from admin_roles
          where user_id  = auth.uid()
            and role      = 'super_admin'
            and school_id is null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'notification_triggers'
      and policyname = 'notification_triggers_super_admin'
  ) then
    create policy "notification_triggers_super_admin"
      on notification_triggers for all
      using (
        exists (
          select 1 from admin_roles
          where user_id  = auth.uid()
            and role      = 'super_admin'
            and school_id is null
        )
      );
  end if;
end $$;
