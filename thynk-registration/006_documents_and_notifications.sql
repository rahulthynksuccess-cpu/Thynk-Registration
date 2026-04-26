-- ================================================================
-- Migration 006: Client Documents + Dashboard Notifications
-- Run in: Supabase Dashboard → SQL Editor
-- ================================================================

-- ── client_documents ─────────────────────────────────────────────
-- Stores metadata for files uploaded by Admin for a specific school.
-- Actual files live in Supabase Storage bucket "client-documents".
create table if not exists client_documents (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  uploaded_by   uuid references auth.users(id) on delete set null,
  file_name     text not null,            -- original filename shown to client
  file_path     text not null,            -- storage object path  e.g. "{school_id}/{uuid}.pdf"
  file_type     text not null,            -- mime type            e.g. "application/pdf"
  file_size     bigint not null default 0, -- bytes
  category      text not null default 'general'
                  check (category in ('general','contract','invoice','report','media','other')),
  description   text,                     -- optional note from admin
  is_visible    boolean not null default true,  -- admin can hide from portal
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_client_documents_updated_at
  before update on client_documents
  for each row execute function update_updated_at();

create index if not exists idx_client_documents_school
  on client_documents(school_id, created_at desc);

-- ── dashboard_notifications ──────────────────────────────────────
-- In-app notification feed shown on the Admin dashboard bell icon
-- AND on the School (client) dashboard.
create table if not exists dashboard_notifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid references schools(id) on delete cascade,
  -- NULL school_id = global notification visible to all school dashboards
  audience      text not null default 'school'
                  check (audience in ('admin', 'school', 'both')),
  -- 'admin'  → only visible in admin panel
  -- 'school' → only visible on school/client dashboard
  -- 'both'   → visible in both places
  type          text not null default 'info'
                  check (type in ('info','success','warning','alert','document')),
  title         text not null,
  message       text not null,
  entity_type   text,     -- e.g. 'document', 'registration', 'payment', 'data_pattern'
  entity_id     uuid,     -- id of the related entity (for deep-link)
  is_read       boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_dashboard_notifications_school
  on dashboard_notifications(school_id, created_at desc);

create index if not exists idx_dashboard_notifications_admin
  on dashboard_notifications(audience, created_at desc) where audience in ('admin','both');

-- ── notification_reads ───────────────────────────────────────────
-- Per-user read tracking (so each admin/school user has their own read state)
create table if not exists notification_reads (
  id                    uuid primary key default gen_random_uuid(),
  notification_id       uuid not null references dashboard_notifications(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  read_at               timestamptz not null default now(),
  unique(notification_id, user_id)
);

create index if not exists idx_notification_reads_user
  on notification_reads(user_id, notification_id);

-- ── RLS ──────────────────────────────────────────────────────────
alter table client_documents          enable row level security;
alter table dashboard_notifications   enable row level security;
alter table notification_reads        enable row level security;

-- client_documents: admin manages, school reads their own
create policy "client_documents_admin_all" on client_documents for all
  using (is_super_admin() or school_id in (select accessible_school_ids()));

create policy "client_documents_school_select" on client_documents for select
  using (is_visible = true and school_id in (select accessible_school_ids()));

-- dashboard_notifications: super admin manages all; school reads their own
create policy "dashboard_notifications_admin_all" on dashboard_notifications for all
  using (is_super_admin());

create policy "dashboard_notifications_school_select" on dashboard_notifications for select
  using (
    audience in ('school','both')
    and (school_id is null or school_id in (select accessible_school_ids()))
  );

-- notification_reads: users manage their own reads
create policy "notification_reads_own" on notification_reads for all
  using (user_id = auth.uid());

-- ── Supabase Storage bucket (run once) ───────────────────────────
-- In Supabase Dashboard → Storage, create a PRIVATE bucket named:
--   client-documents
-- Then apply these policies via the Storage → Policies UI, or run:
--
-- insert into storage.buckets (id, name, public) values ('client-documents', 'client-documents', false)
-- on conflict (id) do nothing;
