// app/api/admin/letter-templates/route.ts
// CRUD for program-linked PPTX letter templates
// Storage bucket: 'letter-templates'

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
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

// ── GET /api/admin/letter-templates?projectId=xxx ─────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  let query = service
    .from('letter_templates')
    .select(`
      id, project_id, file_name, file_path, file_size,
      school_name_token, school_code_token, description,
      is_active, uploaded_by, created_at,
      projects ( id, name, slug )
    `)
    .order('created_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed download URLs (1 hour)
  const templates = await Promise.all(
    (data ?? []).map(async (t: any) => {
      const { data: signed } = await service.storage
        .from('letter-templates')
        .createSignedUrl(t.file_path, 3600);
      return { ...t, download_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ templates });
}

// ── POST /api/admin/letter-templates  (multipart/form-data) ───────────────────
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const formData = await req.formData();

  const file             = formData.get('file') as File | null;
  const projectId        = formData.get('projectId') as string | null;
  const schoolNameToken  = (formData.get('schoolNameToken') as string) || 'Cyboard School';
  const schoolCodeToken  = (formData.get('schoolCodeToken') as string) || 'cyboard2026';
  const description      = (formData.get('description') as string) || null;

  if (!file || !projectId)
    return NextResponse.json({ error: 'file and projectId are required' }, { status: 400 });

  if (!file.name.endsWith('.pptx'))
    return NextResponse.json({ error: 'Only .pptx files are accepted as letter templates' }, { status: 400 });

  // Verify program exists
  const { data: program } = await service
    .from('projects')
    .select('id, name, slug')
    .eq('id', projectId)
    .single();
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 400 });

  // Upload to storage: letter-templates/{projectId}/{timestamp}_{filename}
  const bytes    = await file.arrayBuffer();
  const filePath = `${projectId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: storageErr } = await service.storage
    .from('letter-templates')
    .upload(filePath, bytes, { contentType: file.type, upsert: false });

  if (storageErr)
    return NextResponse.json({ error: `Storage error: ${storageErr.message}` }, { status: 500 });

  // Upsert template record (one per program)
  const { data: existing } = await service
    .from('letter_templates')
    .select('id, file_path')
    .eq('project_id', projectId)
    .single();

  if (existing) {
    // Delete old file from storage
    await service.storage.from('letter-templates').remove([existing.file_path]);

    const { data: updated, error: updateErr } = await service
      .from('letter_templates')
      .update({
        file_name: file.name, file_path: filePath, file_size: file.size,
        school_name_token: schoolNameToken, school_code_token: schoolCodeToken,
        description, is_active: true, uploaded_by: user.id,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ template: updated, program });
  }

  const { data: template, error: insertErr } = await service
    .from('letter_templates')
    .insert({
      project_id: projectId, file_name: file.name, file_path: filePath,
      file_size: file.size, school_name_token: schoolNameToken,
      school_code_token: schoolCodeToken, description,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ template, program }, { status: 201 });
}

// ── DELETE /api/admin/letter-templates?id=xxx ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service   = createServiceClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: tmpl } = await service
    .from('letter_templates')
    .select('file_path')
    .eq('id', id)
    .single();

  if (tmpl?.file_path) {
    await service.storage.from('letter-templates').remove([tmpl.file_path]);
  }

  const { error } = await service.from('letter_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
