// app/api/admin/letter-templates/route.ts
// Accepts PDF templates (not PPTX anymore — no conversion needed)

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

// ── GET /api/admin/letter-templates?projectId=xxx ─────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const projectId = new URL(req.url).searchParams.get('projectId');

  let query = service
    .from('letter_templates')
    .select('*, projects(id, name, slug)')
    .order('created_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = await Promise.all((data ?? []).map(async (t: any) => {
    const { data: signed } = await service.storage
      .from('letter-templates')
      .createSignedUrl(t.file_path, 3600);
    return { ...t, download_url: signed?.signedUrl ?? null };
  }));

  return NextResponse.json({ templates });
}

// ── POST /api/admin/letter-templates (multipart/form-data) ────────────────────
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service  = createServiceClient();
  const formData = await req.formData();

  const file            = formData.get('file')            as File   | null;
  const projectId       = formData.get('projectId')       as string | null;
  const schoolNameToken = (formData.get('schoolNameToken') as string) || 'Cyboard School';
  const schoolCodeToken = (formData.get('schoolCodeToken') as string) || 'cyboard2026';
  const nameTokenColor  = (formData.get('nameTokenColor')  as string) || '#000000';
  const codeTokenColor  = (formData.get('codeTokenColor')  as string) || '#000000';
  const description     = (formData.get('description')    as string) || null;

  if (!file || !projectId)
    return NextResponse.json({ error: 'file and projectId are required' }, { status: 400 });

  if (!file.name.endsWith('.pdf'))
    return NextResponse.json({ error: 'Only PDF files are accepted as letter templates' }, { status: 400 });

  // Verify program exists
  const { data: program } = await service
    .from('projects').select('id, name, slug').eq('id', projectId).single();
  if (!program)
    return NextResponse.json({ error: 'Program not found' }, { status: 400 });

  const bytes    = await file.arrayBuffer();
  const filePath = `${projectId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: storageErr } = await service.storage
    .from('letter-templates')
    .upload(filePath, bytes, { contentType: 'application/pdf', upsert: false });

  if (storageErr)
    return NextResponse.json({ error: `Storage error: ${storageErr.message}` }, { status: 500 });

  // Upsert — one template per program
  const { data: existing } = await service
    .from('letter_templates').select('id, file_path').eq('project_id', projectId).single();

  if (existing) {
    await service.storage.from('letter-templates').remove([existing.file_path]);
    const { data: updated, error: ue } = await service
      .from('letter_templates')
      .update({
        file_name: file.name, file_path: filePath, file_size: file.size,
        file_type: 'application/pdf',
        school_name_token: schoolNameToken, school_code_token: schoolCodeToken,
        name_token_color: nameTokenColor,   code_token_color: codeTokenColor,
        description, is_active: true, uploaded_by: user.id,
      })
      .eq('id', existing.id).select().single();
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
    return NextResponse.json({ template: updated, program });
  }

  const { data: template, error: ie } = await service
    .from('letter_templates')
    .insert({
      project_id: projectId, file_name: file.name, file_path: filePath,
      file_size: file.size, file_type: 'application/pdf',
      school_name_token: schoolNameToken, school_code_token: schoolCodeToken,
      name_token_color: nameTokenColor,   code_token_color: codeTokenColor,
      description, uploaded_by: user.id,
    })
    .select().single();

  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  return NextResponse.json({ template, program }, { status: 201 });
}

// ── DELETE /api/admin/letter-templates?id=xxx ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: tmpl } = await service
    .from('letter_templates').select('file_path').eq('id', id).single();
  if (tmpl?.file_path)
    await service.storage.from('letter-templates').remove([tmpl.file_path]);

  const { error } = await service.from('letter_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
