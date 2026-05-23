/**
 * app/api/admin/leads/route.ts
 * GET    /api/admin/leads?school_id=&project_id=&status=&limit=
 * POST   /api/admin/leads          — single lead or bulk import
 * PATCH  /api/admin/leads          — update status/notes on one or many
 * DELETE /api/admin/leads          — delete by id
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function getAdminContext(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roles } = await service
    .from('admin_roles')
    .select('role, school_id, all_schools')
    .eq('user_id', user.id);
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin   = roles?.some(r => r.role === 'sub_admin');
  return { user, service, isSuperAdmin, isSubAdmin, roles };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getAdminContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { service, isSuperAdmin, isSubAdmin, roles } = ctx;
  const { searchParams } = new URL(req.url);
  const school_id  = searchParams.get('school_id');
  const project_id = searchParams.get('project_id');
  const status     = searchParams.get('status');
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '2000'), 5000);

  let q = service
    .from('lead_database')
    .select('*, schools(id,name,school_code,project_id)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (school_id)  q = q.eq('school_id', school_id);
  if (project_id) q = q.eq('project_id', project_id);
  if (status)     q = q.eq('status', status);

  // Scope sub-admins to their allowed schools
  if (!isSuperAdmin && isSubAdmin) {
    const allSchools = roles?.some(r => r.role === 'sub_admin' && r.all_schools);
    if (!allSchools) {
      const allowedIds = roles?.filter(r => r.school_id).map(r => r.school_id) ?? [];
      if (!allowedIds.length) return NextResponse.json({ leads: [] });
      q = q.in('school_id', allowedIds);
    }
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data ?? [] });
}

// ── POST — single insert OR bulk import ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getAdminContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, service } = ctx;
  const body = await req.json();

  // Bulk import: { leads: [...] }
  if (Array.isArray(body.leads)) {
    const rows = body.leads.map((l: any) => ({
      school_id:    l.school_id,
      project_id:   l.project_id   ?? null,
      student_name: l.student_name ?? null,
      grade:        l.grade        ?? null,
      parent_name:  l.parent_name  ?? null,
      mobile:       String(l.mobile ?? '').replace(/\D/g, '').slice(0, 15) || null,
      email:        l.email        ?? null,
      status:       l.status       ?? 'new',
      source:       l.source       ?? 'excel_import',
      notes:        l.notes        ?? null,
      uploaded_by:  user.id,
    })).filter((r: any) => r.school_id); // must have school_id

    if (!rows.length)
      return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 });

    // Import all (duplicates allowed per spec)
    const { data, error } = await service
      .from('lead_database')
      .insert(rows)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ inserted: data?.length ?? 0 });
  }

  // Single insert
  const { school_id, project_id, student_name, grade, parent_name, mobile, email, status, notes, source } = body;
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

  const { data, error } = await service
    .from('lead_database')
    .insert({
      school_id, project_id: project_id ?? null,
      student_name: student_name ?? null, grade: grade ?? null,
      parent_name: parent_name ?? null,
      mobile: mobile ? String(mobile).replace(/\D/g, '').slice(0, 15) : null,
      email: email ?? null,
      status: status ?? 'new',
      notes: notes ?? null,
      source: source ?? 'manual',
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

// ── PATCH — update status / notes (single or bulk) ───────────────────────────
export async function PATCH(req: NextRequest) {
  const ctx = await getAdminContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { service } = ctx;
  const body = await req.json();

  // Bulk update: { ids: [...], status, notes }
  if (Array.isArray(body.ids)) {
    const update: Record<string, any> = {};
    if (body.status !== undefined) update.status = body.status;
    if (body.notes  !== undefined) update.notes  = body.notes;

    const { error } = await service
      .from('lead_database')
      .update(update)
      .in('id', body.ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: body.ids.length });
  }

  // Single update
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const allowed = ['status','notes','student_name','grade','parent_name','mobile','email'];
  const update: Record<string,any> = {};
  for (const k of allowed) if (fields[k] !== undefined) update[k] = fields[k];

  const { data, error } = await service
    .from('lead_database')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const ctx = await getAdminContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { service } = ctx;
  const { id, ids } = await req.json();

  if (Array.isArray(ids) && ids.length) {
    const { error } = await service.from('lead_database').delete().in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: ids.length });
  }

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await service.from('lead_database').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: 1 });
}
