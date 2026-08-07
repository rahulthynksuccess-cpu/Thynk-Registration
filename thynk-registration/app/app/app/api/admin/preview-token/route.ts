/**
 * POST /api/admin/preview-token
 * Body: { school_id: string }
 * Returns: { token, url, school_name, expires_in }
 *
 * Super-admin only. Generates a 15-minute signed token so the admin can
 * open any school's dashboard without needing to log in as that school.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { buildPreviewToken } from '@/lib/preview-token';

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .is('school_id', null)
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  const body     = await req.json();
  const schoolId = body?.school_id as string | undefined;
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

  const { data: school } = await service
    .from('schools')
    .select('id, name, school_code')
    .eq('id', schoolId)
    .single();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const token  = buildPreviewToken(schoolId);
  const appUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
  const url    = `${appUrl}/school/dashboard?preview_token=${token}`;

  return NextResponse.json({ token, url, school_name: school.name, expires_in: '15 minutes' });
}
