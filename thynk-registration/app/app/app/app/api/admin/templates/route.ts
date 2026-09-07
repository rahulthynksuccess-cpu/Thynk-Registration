import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');

  // Join projects so the UI can display the program name
  let query = service
    .from('notification_templates')
    .select('*, projects(id, name)')
    .order('created_at', { ascending: false });

  if (schoolId) query = query.eq('school_id', schoolId);
  else if (auth.role.role !== 'super_admin') query = query.eq('school_id', auth.role.school_id);

  const { data } = await query;
  return NextResponse.json({ templates: data ?? [] });
}

function sanitizeTemplate(raw: Record<string, any>) {
  const { name, channel, subject, body, is_active, school_id, project_id } = raw;
  return {
    name,
    channel,
    subject:    subject   ?? null,
    body:       body      ?? '',
    is_active:  is_active ?? true,
    school_id:  school_id  || null,
    // Empty string from the form → treat as NULL (global)
    project_id: project_id || null,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { data, error } = await service
    .from('notification_templates')
    .insert(sanitizeTemplate(body))
    .select('*, projects(id, name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...rest } = await req.json();
  const { data, error } = await service
    .from('notification_templates')
    .update(sanitizeTemplate(rest))
    .eq('id', id)
    .select('*, projects(id, name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('notification_templates').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
