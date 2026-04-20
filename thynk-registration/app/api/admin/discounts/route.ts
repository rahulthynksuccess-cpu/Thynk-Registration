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
  const schoolId = searchParams.get('schoolId');
  let query = service.from('discount_codes').select('*, schools(name, school_code)').order('created_at', { ascending: false });
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  } else if (!auth.isSuperAdmin && auth.isSubAdmin && !auth.allSchools) {
    if (!auth.allowedSchoolIds.length) return NextResponse.json({ discounts: [] });
    query = query.in('school_id', auth.allowedSchoolIds);
  }
  const { data } = await query;
  return NextResponse.json({ discounts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { data, error } = await service.from('discount_codes').insert({
    school_id:       body.school_id,
    code:            body.code.toUpperCase().trim(),
    discount_amount: Math.round(Number(body.discount_amount) * 100),
    max_uses:        body.max_uses ? Number(body.max_uses) : null,
    expires_at:      body.expires_at || null,
    is_active:       true,
    used_count:      0,
  }).select().single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Code already exists for this school' : error.message }, { status: 400 });
  return NextResponse.json({ discount: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (updates.discount_amount) updates.discount_amount = Math.round(Number(updates.discount_amount) * 100);
  const { data, error } = await service.from('discount_codes').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ discount: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('discount_codes').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
