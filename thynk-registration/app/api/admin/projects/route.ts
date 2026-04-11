import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity';

async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: projects } = await service
    .from('projects')
    .select('*, schools(id, school_code, name, is_active)')
    .order('created_at', { ascending: false });
  return NextResponse.json({ projects: projects ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { name, slug, domain, status } = body;
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 });
  const { data, error } = await service.from('projects').insert({
    name, slug: slug.toLowerCase().replace(/\s+/g, '-'), domain: domain || null, status: status || 'active',
  }).select().single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Slug already exists' : error.message }, { status: 400 });
  await logActivity({ userId: user.id, action: 'project.created', entityType: 'project', entityId: data.id, metadata: { name } });
  return NextResponse.json({ project: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { data, error } = await service.from('projects').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logActivity({ userId: user.id, action: 'project.updated', entityType: 'project', entityId: id });
  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('projects').update({ status: 'inactive' }).eq('id', id);
  await logActivity({ userId: user.id, action: 'project.deactivated', entityType: 'project', entityId: id });
  return NextResponse.json({ success: true });
}
