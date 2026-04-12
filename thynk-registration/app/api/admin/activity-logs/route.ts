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

export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const schoolId = searchParams.get('schoolId');
  let query = service
    .from('activity_logs')
    .select('*, schools(name, school_code)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data } = await query;

  // Enrich with user emails
  const service2 = createServiceClient();
  const { data: { users: authUsers } } = await service2.auth.admin.listUsers();
  const emailMap = Object.fromEntries(authUsers.map((u: any) => [u.id, u.email]));
  const enriched = (data ?? []).map((row: any) => ({ ...row, user_email: emailMap[row.user_id] ?? '—' }));

  return NextResponse.json({ logs: enriched });
}
