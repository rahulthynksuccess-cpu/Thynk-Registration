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

export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: projects } = await service.from('projects').select('*').order('created_at', { ascending: false });
  return NextResponse.json({ projects: projects ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { name, slug, base_amount_inr, base_amount_usd, status, allowed_grades } = body;
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 });
  const inr = Math.round(Number(base_amount_inr || 0));
  const usd = base_amount_usd ? Math.round(Number(base_amount_usd)) : null;
  const { data, error } = await service.from('projects').insert({
    name,
    slug:            slug.toLowerCase().replace(/\s+/g, '-'),
    base_amount:     inr,
    currency:        'INR',
    base_amount_inr: inr,
    base_amount_usd: usd,
    status:          status || 'active',
    allowed_grades:  allowed_grades ?? [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Slug already exists' : error.message }, { status: 400 });
  return NextResponse.json({ project: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, name, base_amount_inr, base_amount_usd, status, allowed_grades } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const updates: Record<string, any> = {};
  if (name           !== undefined) updates.name           = name;
  if (status         !== undefined) updates.status         = status;
  if (allowed_grades !== undefined) updates.allowed_grades = allowed_grades;
  if (base_amount_inr !== undefined) {
    updates.base_amount_inr = Math.round(Number(base_amount_inr));
    updates.base_amount     = Math.round(Number(base_amount_inr));
  }
  if (base_amount_usd !== undefined) {
    updates.base_amount_usd = base_amount_usd ? Math.round(Number(base_amount_usd)) : null;
  }
  const { data, error } = await service.from('projects').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('projects').update({ status: 'inactive' }).eq('id', id);
  return NextResponse.json({ success: true });
}
