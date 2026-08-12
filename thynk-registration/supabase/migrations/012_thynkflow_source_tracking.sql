-- 012_thynkflow_source_tracking.sql
-- Tracks which schools were created via the ThynkFlow CRM integration
-- (POST /api/integration/thynkflow-school), so a lead can never create
-- two schools if the "Create School" button is tapped twice.

alter table public.schools
  add column if not exists source_system text;

alter table public.schools
  add column if not exists source_lead_id text;

-- One school per (source_system, source_lead_id) — but allow many NULLs
-- (schools created the normal way have no source_lead_id).
create unique index if not exists idx_schools_source_lead_unique
  on public.schools (source_system, source_lead_id)
  where source_lead_id is not null;
