// app/api/admin/school-letters/route.ts
// Read-only log of letter generation history

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient, getAdminPermissions } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId  = searchParams.get('schoolId');
  const projectId = searchParams.get('projectId');
  const status    = searchParams.get('status');

  let query = service
    .from('school_letters')
    .select(`
      id, school_id, project_id, template_id, document_id,
      status, error_message, generated_at, triggered_by, created_at,
      schools ( name, school_code ),
      projects ( name, slug )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!perms.isSuperAdmin && perms.allowedSchoolIds) {
    query = query.in('school_id', perms.allowedSchoolIds);
  }
  if (schoolId)  query = query.eq('school_id', schoolId);
  if (projectId) query = query.eq('project_id', projectId);
  if (status)    query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
