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
  let query = service.from('notification_templates').select('*').order('created_at', { ascending: false });
  if (schoolId) query = query.eq('school_id', schoolId);
  else if (auth.role.role !== 'super_admin') query = query.eq('school_id', auth.role.school_id);
  const { data } = await query;
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { data, error } = await service.from('notification_templates').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  const { data, error } = await service.from('notification_templates').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('notification_templates').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
