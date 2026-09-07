import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient, getAdminPermissions } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity';
import { createDashboardNotification } from '@/lib/notifications';

// ── GET /api/admin/documents?schoolId=xxx ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  const category = searchParams.get('category');

  let query = service
    .from('client_documents')
    .select(`
      id, school_id, file_name, file_path, file_type, file_size,
      category, description, is_visible, created_at,
      uploaded_by,
      schools ( name, school_code )
    `)
    .order('created_at', { ascending: false });

  if (!perms.isSuperAdmin && perms.allowedSchoolIds) {
    query = query.in('school_id', perms.allowedSchoolIds);
  }
  if (schoolId) query = query.eq('school_id', schoolId);
  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each document (1-hour expiry)
  const docs = await Promise.all(
    (data ?? []).map(async (doc: any) => {
      const { data: signed } = await service.storage
        .from('client-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: docs });
}

// ── POST /api/admin/documents  (multipart/form-data) ─────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file      = formData.get('file') as File | null;
  const schoolId  = formData.get('schoolId') as string | null;
  const category  = (formData.get('category') as string) || 'general';
  const description = (formData.get('description') as string) || null;

  if (!file || !schoolId) {
    return NextResponse.json({ error: 'file and schoolId are required' }, { status: 400 });
  }

  // Validate file type
  const ALLOWED_TYPES: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: `File type "${file.type}" is not allowed` }, { status: 400 });
  }

  // Max 100 MB
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size exceeds 100 MB limit' }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify school exists and admin has access
  const { data: school } = await service
    .from('schools')
    .select('id, name, school_code')
    .eq('id', schoolId)
    .single();

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  if (!perms.isSuperAdmin && !perms.allowedSchoolIds?.includes(schoolId)) {
    return NextResponse.json({ error: 'Access denied to this school' }, { status: 403 });
  }

  // Upload to Supabase Storage
  const ext       = ALLOWED_TYPES[file.type];
  const uuid      = crypto.randomUUID();
  const storagePath = `${schoolId}/${uuid}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await service.storage
    .from('client-documents')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  // Save metadata to DB
  const { data: docRecord, error: dbError } = await service
    .from('client_documents')
    .insert({
      school_id:   schoolId,
      uploaded_by: user.id,
      file_name:   file.name,
      file_path:   storagePath,
      file_type:   file.type,
      file_size:   file.size,
      category,
      description,
      is_visible:  true,
    })
    .select()
    .single();

  if (dbError) {
    // Rollback storage
    await service.storage.from('client-documents').remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Log activity
  await logActivity({
    userId:     user.id,
    schoolId,
    action:     'document.uploaded',
    entityType: 'document',
    entityId:   docRecord.id,
    metadata:   { file_name: file.name, category, file_size: file.size },
  });

  // Create dashboard notification for the school
  await createDashboardNotification({
    schoolId,
    audience:   'both',
    type:       'document',
    title:      '📎 New Document Available',
    message:    `A new ${category} document "${file.name}" has been uploaded for your review.`,
    entityType: 'document',
    entityId:   docRecord.id,
    createdBy:  user.id,
  });

  return NextResponse.json({ document: docRecord }, { status: 201 });
}

// ── DELETE /api/admin/documents?id=xxx ────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('id');
  if (!docId) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const service = createServiceClient();

  const { data: doc } = await service
    .from('client_documents')
    .select('id, school_id, file_path, file_name')
    .eq('id', docId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  if (!perms.isSuperAdmin && !perms.allowedSchoolIds?.includes(doc.school_id)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Remove from storage
  await service.storage.from('client-documents').remove([doc.file_path]);

  // Remove from DB
  const { error } = await service.from('client_documents').delete().eq('id', docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    userId:     user.id,
    schoolId:   doc.school_id,
    action:     'document.deleted',
    entityType: 'document',
    entityId:   doc.id,
    metadata:   { file_name: doc.file_name },
  });

  return NextResponse.json({ success: true });
}

// ── PATCH /api/admin/documents  (toggle visibility / update description) ──────
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body  = await req.json();
  const { id, is_visible, description } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const service  = createServiceClient();
  const updates: Record<string, any> = {};
  if (typeof is_visible  !== 'undefined') updates.is_visible  = is_visible;
  if (typeof description !== 'undefined') updates.description = description;

  const { data, error } = await service
    .from('client_documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data });
}
