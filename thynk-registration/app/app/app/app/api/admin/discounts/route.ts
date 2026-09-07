import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdminWithScope(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roleRows } = await service.from('admin_roles').select('role,school_id,all_schools').eq('user_id', user.id);
  if (!roleRows?.length) return null;
  const isSuperAdmin = roleRows.some((r: any) => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin   = roleRows.some((r: any) => r.role === 'sub_admin');
  const allSchools   = roleRows.some((r: any) => r.role === 'sub_admin' && r.all_schools);
  const allowedSchoolIds = roleRows.filter((r: any) => r.school_id).map((r: any) => r.school_id);
  if (!isSuperAdmin && !isSubAdmin) return null;
  return { user, isSuperAdmin, isSubAdmin, allSchools, allowedSchoolIds };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminWithScope(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId  = searchParams.get('schoolId');
  const projectId = searchParams.get('projectId');
  let query = service.from('discount_codes')
    .select('*, schools(name, school_code), projects(name)')
    .order('created_at', { ascending: false });

  if (schoolId) {
    query = query.eq('school_id', schoolId);
  } else if (projectId) {
    query = query.eq('project_id', projectId);
  } else if (!auth.isSuperAdmin && auth.isSubAdmin && !auth.allSchools) {
    // Scope non-super admins to codes for schools they can access, plus
    // program-wide codes for any program that includes one of those schools.
    if (!auth.allowedSchoolIds.length) return NextResponse.json({ discounts: [] });
    const { data: myProjects } = await service.from('schools').select('project_id').in('id', auth.allowedSchoolIds);
    const projectIds = Array.from(new Set((myProjects ?? []).map((s: any) => s.project_id).filter(Boolean)));
    const orParts = [`school_id.in.(${auth.allowedSchoolIds.join(',')})`];
    if (projectIds.length) orParts.push(`project_id.in.(${projectIds.join(',')})`);
    query = query.or(orParts.join(','));
  }
  const { data } = await query;
  return NextResponse.json({ discounts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminWithScope(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();

  // A code is scoped to EITHER one school OR an entire program (all its
  // schools) — never both. `scope` from the admin form drives which one gets
  // sent; fall back to inferring from whichever id was provided.
  const scope = body.scope === 'project' ? 'project' : body.scope === 'school' ? 'school' : (body.project_id ? 'project' : 'school');

  if (scope === 'project') {
    if (!body.project_id) return NextResponse.json({ error: 'Program is required' }, { status: 400 });

    // Non-super admins may only create a program-wide code for a program they
    // actually have access to (i.e. they can access at least one school in it,
    // or have the all_schools flag).
    if (!auth.isSuperAdmin && !auth.allSchools) {
      const { data: schoolsInProject } = await service.from('schools').select('id').eq('project_id', body.project_id);
      const hasAccess = (schoolsInProject ?? []).some((s: any) => auth.allowedSchoolIds.includes(s.id));
      if (!hasAccess) return NextResponse.json({ error: 'Forbidden — no access to schools in this program' }, { status: 403 });
    }
  } else {
    if (!body.school_id) return NextResponse.json({ error: 'School is required' }, { status: 400 });
    if (!auth.isSuperAdmin && !auth.allSchools && !auth.allowedSchoolIds.includes(body.school_id)) {
      return NextResponse.json({ error: 'Forbidden — no access to this school' }, { status: 403 });
    }
  }

  const { data, error } = await service.from('discount_codes').insert({
    school_id:       scope === 'school'  ? body.school_id  : null,
    project_id:      scope === 'project' ? body.project_id : null,
    code:            body.code.toUpperCase().trim(),
    discount_amount: Math.round(Number(body.discount_amount) * 100),
    max_uses:        body.max_uses ? Number(body.max_uses) : null,
    expires_at:      body.expires_at || null,
    is_active:       true,
    used_count:      0,
  }).select().single();

  if (error) {
    const msg = error.code === '23505'
      ? `That code already exists for this ${scope === 'project' ? 'program' : 'school'}`
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ discount: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminWithScope(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (updates.discount_amount) updates.discount_amount = Math.round(Number(updates.discount_amount) * 100);
  // school_id / project_id / scope are fixed at creation time — don't let a PATCH change scope.
  delete updates.school_id;
  delete updates.project_id;
  delete updates.scope;
  const { data, error } = await service.from('discount_codes').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ discount: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminWithScope(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('discount_codes').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
