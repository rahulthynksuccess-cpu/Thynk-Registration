import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';


async function requireAdminWithScope(req: NextRequest): Promise<{
  user: any; isSuperAdmin: boolean; isSubAdmin: boolean;
  allowedSchoolIds: string[]; allSchools: boolean;
} | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roleRows } = await service
    .from('admin_roles').select('role, school_id, all_schools')
    .eq('user_id', user.id);
  if (!roleRows?.length) return null;
  const isSuperAdmin = roleRows.some((r: any) => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin   = roleRows.some((r: any) => r.role === 'sub_admin');
  const allSchools   = roleRows.some((r: any) => r.role === 'sub_admin' && r.all_schools);
  const allowedSchoolIds = roleRows
    .filter((r: any) => r.school_id).map((r: any) => r.school_id);
  if (!isSuperAdmin && !isSubAdmin) return null;
  return { user, isSuperAdmin, isSubAdmin, allowedSchoolIds, allSchools };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminWithScope(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const schoolId = searchParams.get('schoolId');
  let query = service
    .from('activity_logs')
    .select('*, schools(name, school_code)')
    .order('created_at', { ascending: false })
    .limit(limit);
  // Sub-admin: scope to assigned schools
  if (!auth.isSuperAdmin && auth.isSubAdmin && !auth.allSchools) {
    if (auth.allowedSchoolIds.length === 0) return NextResponse.json({ logs: [] });
    query = query.in('school_id', auth.allowedSchoolIds);
  } else if (schoolId) {
    query = query.eq('school_id', schoolId);
  }
  const { data } = await query;

  // Enrich with user emails
  const service2 = createServiceClient();
  const { data: { users: authUsers } } = await service2.auth.admin.listUsers();
  const emailMap = Object.fromEntries(authUsers.map((u: any) => [u.id, u.email]));
  const enriched = (data ?? []).map((row: any) => ({ ...row, user_email: emailMap[row.user_id] ?? '—' }));

  return NextResponse.json({ logs: enriched });
}
