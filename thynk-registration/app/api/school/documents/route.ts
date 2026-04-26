import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

// ── GET /api/school/documents  ────────────────────────────────────────────────
// Called from the Client (School) dashboard — returns documents uploaded for
// the logged-in school.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Resolve which school this user belongs to
  const { data: roleRow } = await service
    .from('admin_roles')
    .select('school_id, role')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .maybeSingle();

  if (!roleRow?.school_id) {
    return NextResponse.json({ error: 'No school associated with this account' }, { status: 403 });
  }

  const schoolId = roleRow.school_id;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  let query = service
    .from('client_documents')
    .select('id, file_name, file_type, file_size, category, description, created_at')
    .eq('school_id', schoolId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate short-lived signed download URLs
  const docs = await Promise.all(
    (data ?? []).map(async (doc: any) => {
      // We need file_path to generate signed URL — fetch it separately
      const { data: full } = await service
        .from('client_documents')
        .select('file_path')
        .eq('id', doc.id)
        .single();

      const { data: signed } = await service.storage
        .from('client-documents')
        .createSignedUrl(full?.file_path ?? '', 3600);

      return { ...doc, download_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: docs });
}
