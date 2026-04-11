import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .is('school_id', null)
    .single();
  return data ? user : null;
}

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: projects } = await service
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  return NextResponse.json({ projects: projects ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { name, slug, base_amount_inr, base_amount_usd, status } = body;

  if (!name || !slug)
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 });

  const inr = Math.round(Number(base_amount_inr || 0));
  const usd = Math.round(Number(base_amount_usd || 0));

  const { data, error } = await service.from('projects').insert({
    name,
    slug:            slug.toLowerCase().replace(/\s+/g, '-'),
    base_amount:     inr,
    currency:        'INR',
    base_amount_inr: inr,
    base_amount_usd: usd,
    status:          status || 'active',
  }).select().single();

  if (error)
    return NextResponse.json(
      { error: error.code === '23505' ? 'Slug already exists' : error.message },
      { status: 400 }
    );

  return NextResponse.json({ project: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, base_amount_inr, base_amount_usd, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updates: Record<string, any> = { ...rest };

  if (base_amount_inr !== undefined) {
    updates.base_amount_inr = Math.round(Number(base_amount_inr));
    updates.base_amount     = Math.round(Number(base_amount_inr));
  }
  if (base_amount_usd !== undefined) {
    updates.base_amount_usd = Math.round(Number(base_amount_usd));
  }

  const { data, error } = await service
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('projects').update({ status: 'inactive' }).eq('id', id);
  return NextResponse.json({ success: true });
}
