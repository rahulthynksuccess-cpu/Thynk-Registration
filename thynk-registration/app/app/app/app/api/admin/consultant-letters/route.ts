// app/api/admin/consultant-letters/route.ts
// Read-only log of consultant letter generation history.
// Mirrors app/api/admin/school-letters/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const consultantId = searchParams.get('consultantId');
  const projectId     = searchParams.get('projectId');
  const status        = searchParams.get('status');

  let query = service
    .from('consultant_letters')
    .select(`
      id, consultant_id, project_id, template_id, document_id,
      status, error_message, generated_at, triggered_by, created_at,
      projects ( name, slug )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (consultantId) query = query.eq('consultant_id', consultantId);
  if (projectId)    query = query.eq('project_id', projectId);
  if (status)       query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach consultant display name / code (no FK relation to embed via PostgREST)
  const consultantIds = Array.from(new Set((data ?? []).map((r: any) => r.consultant_id)));
  const { data: profiles } = consultantIds.length
    ? await service.from('consultant_profiles').select('user_id, full_name, consultant_code').in('user_id', consultantIds)
    : { data: [] as any[] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]));

  const logs = (data ?? []).map((r: any) => ({
    ...r,
    consultants: {
      full_name:       profileMap[r.consultant_id]?.full_name ?? '—',
      consultant_code: profileMap[r.consultant_id]?.consultant_code ?? '—',
    },
  }));

  return NextResponse.json({ logs });
}
