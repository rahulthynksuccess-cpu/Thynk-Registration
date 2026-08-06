import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { verifyPreviewToken } from '@/lib/preview-token';

// ── GET /api/school/documents  ────────────────────────────────────────────────
// Called from the Client (School) dashboard — returns documents uploaded for
// the logged-in school.
// Also supports ?preview_token=xxx for admin preview mode (no Supabase session).
export async function GET(req: NextRequest) {
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  // ── Preview mode: admin opened the school dashboard via a signed token ──
  const previewToken = searchParams.get('preview_token');
  if (previewToken) {
    const verified = verifyPreviewToken(previewToken);
    if (!verified) {
      return NextResponse.json({ error: 'Invalid or expired preview token' }, { status: 401 });
    }
    return fetchDocuments(service, verified.schoolId, category);
  }

  // ── Normal mode: requires Supabase session ──────────────────────────────
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  return fetchDocuments(service, roleRow.school_id, category);
}

// ── Shared fetch helper ───────────────────────────────────────────────────────
async function fetchDocuments(service: any, schoolId: string, category: string | null) {
  let query = service
    .from('client_documents')
    .select('id, file_name, file_path, file_type, file_size, category, description, created_at')
    .eq('school_id', schoolId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate short-lived signed download URLs
  const docs = await Promise.all(
    (data ?? []).map(async (doc: any) => {
      const { data: signed } = await service.storage
        .from('client-documents')
        .createSignedUrl(doc.file_path, 3600);

      return { ...doc, download_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: docs });
}
