// app/api/admin/consultant-documents/route.ts
// Document upload/list/delete for CONSULTANTS.
// Mirrors app/api/admin/documents/route.ts (which does this for schools),
// but scoped to consultant_id instead of school_id, using the
// "consultant-documents" storage bucket and consultant_documents table.

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity';

async function requireConsultantAccess(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: rows } = await service
    .from('admin_roles')
    .select('role, allowed_pages')
    .eq('user_id', user.id);

  const isSuperAdmin = rows?.some((r: any) => r.role === 'super_admin' && !r.school_id);
  const isSubAdminWithConsultants = rows?.some(
    (r: any) => r.role === 'sub_admin' && Array.isArray(r.allowed_pages) && r.allowed_pages.includes('consultants')
  );

  if (!isSuperAdmin && !isSubAdminWithConsultants) return null;
  return user;
}

// ── GET /api/admin/consultant-documents?consultantId=xxx ─────────────────────
export async function GET(req: NextRequest) {
  const user = await requireConsultantAccess(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const consultantId = searchParams.get('consultantId');
  const category = searchParams.get('category');

  let query = service
    .from('consultant_documents')
    .select(`
      id, consultant_id, file_name, file_path, file_type, file_size,
      category, description, is_visible, created_at, uploaded_by
    `)
    .order('created_at', { ascending: false });

  if (consultantId) query = query.eq('consultant_id', consultantId);
  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each document (1-hour expiry)
  const docs = await Promise.all(
    (data ?? []).map(async (doc: any) => {
      const { data: signed } = await service.storage
        .from('consultant-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: docs });
}

// ── POST /api/admin/consultant-documents (multipart/form-data) ───────────────
export async function POST(req: NextRequest) {
  const user = await requireConsultantAccess(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file          = formData.get('file') as File | null;
  const consultantId  = formData.get('consultantId') as string | null;
  const category      = (formData.get('category') as string) || 'general';
  const description   = (formData.get('description') as string) || null;

  if (!file || !consultantId) {
    return NextResponse.json({ error: 'file and consultantId are required' }, { status: 400 });
  }

  const ALLOWED_TYPES: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: `File type "${file.type}" is not allowed` }, { status: 400 });
  }

  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size exceeds 100 MB limit' }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify consultant exists (has a 'consultant' admin_roles row)
  const { data: roleRow } = await service
    .from('admin_roles')
    .select('id')
    .eq('user_id', consultantId)
    .eq('role', 'consultant')
    .maybeSingle();

  if (!roleRow) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });

  const ext        = ALLOWED_TYPES[file.type];
  const uuid       = crypto.randomUUID();
  const storagePath = `${consultantId}/${uuid}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await service.storage
    .from('consultant-documents')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  const { data: docRecord, error: dbError } = await service
    .from('consultant_documents')
    .insert({
      consultant_id: consultantId,
      uploaded_by:   user.id,
      file_name:     file.name,
      file_path:     storagePath,
      file_type:     file.type,
      file_size:     file.size,
      category,
      description,
      is_visible:    true,
    })
    .select()
    .single();

  if (dbError) {
    await service.storage.from('consultant-documents').remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await logActivity({
    userId:     user.id,
    action:     'consultant_document.uploaded',
    entityType: 'consultant_document',
    entityId:   docRecord.id,
    metadata:   { consultant_id: consultantId, file_name: file.name, category, file_size: file.size },
  });

  return NextResponse.json({ document: docRecord }, { status: 201 });
}

// ── DELETE /api/admin/consultant-documents?id=xxx ─────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await requireConsultantAccess(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('id');
  if (!docId) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: doc } = await service
    .from('consultant_documents')
    .select('id, consultant_id, file_path, file_name')
    .eq('id', docId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  await service.storage.from('consultant-documents').remove([doc.file_path]);

  const { error } = await service.from('consultant_documents').delete().eq('id', docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    userId:     user.id,
    action:     'consultant_document.deleted',
    entityType: 'consultant_document',
    entityId:   doc.id,
    metadata:   { consultant_id: doc.consultant_id, file_name: doc.file_name },
  });

  return NextResponse.json({ success: true });
}

// ── PATCH /api/admin/consultant-documents (toggle visibility / description) ──
export async function PATCH(req: NextRequest) {
  const user = await requireConsultantAccess(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { id, is_visible, description } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const service = createServiceClient();
  const updates: Record<string, any> = {};
  if (typeof is_visible !== 'undefined') updates.is_visible = is_visible;
  if (typeof description !== 'undefined') updates.description = description;

  const { data, error } = await service
    .from('consultant_documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data });
}
