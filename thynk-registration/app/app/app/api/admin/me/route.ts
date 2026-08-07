// app/api/admin/me/route.ts
// Returns the current user's roles — used by mobile app to scope the UI

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id')
    .eq('user_id', user.id);

  const roles = [...new Set((roleRows ?? []).map(r => r.role))];

  return NextResponse.json({
    user_id: user.id,
    email:   user.email,
    roles,
  });
}
