import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

// GET /api/admin/grades — list all grades ordered by sort_order
export async function GET(req: NextRequest) {
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get('active') === 'true';
  let query = service.from('grades').select('*').order('sort_order', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grades: data ?? [] });
}

// POST /api/admin/grades — create a new grade
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { name, sort_order, is_active } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const { data, error } = await service.from('grades').insert({
    name: name.trim(),
    sort_order: sort_order ?? 0,
    is_active: is_active !== false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Grade name already exists' : error.message }, { status: 400 });
  return NextResponse.json({ grade: data }, { status: 201 });
}

// PATCH /api/admin/grades — update a grade
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, name, sort_order, is_active } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const updates: Record<string, any> = {};
  if (name      !== undefined) updates.name       = name.trim();
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (is_active  !== undefined) updates.is_active  = is_active;
  const { data, error } = await service.from('grades').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ grade: data });
}

// DELETE /api/admin/grades — hard delete a grade
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { error } = await service.from('grades').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
