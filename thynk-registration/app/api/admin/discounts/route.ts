import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  let query = service.from('discount_codes').select('*, schools(name, school_code)').order('created_at', { ascending: false });
  if (schoolId) query = query.eq('school_id', schoolId);
  else if (auth.role.role !== 'super_admin') query = query.eq('school_id', auth.role.school_id);
  const { data } = await query;
  return NextResponse.json({ discounts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
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
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (updates.discount_amount) updates.discount_amount = Math.round(Number(updates.discount_amount) * 100);
  const { data, error } = await service.from('discount_codes').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ discount: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('discount_codes').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
