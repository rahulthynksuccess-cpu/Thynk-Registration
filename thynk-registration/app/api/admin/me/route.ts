// app/api/admin/me/route.ts
// Returns the current user's roles — used by mobile app to scope the UI.
// PATCH allows the logged-in user to update their own display name, email,
// and/or password (self-service — no separate admin approval needed).

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
    name:    (user.user_metadata as any)?.name ?? null,
    roles,
  });
}

// PATCH /api/admin/me — self-service profile update (name / email / password)
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, email, password } = await req.json();

  if (!name?.trim() && !email?.trim() && !password?.trim()) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (password && password.trim().length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const service = createServiceClient();
  const update: Record<string, any> = {};
  if (name?.trim())     update.user_metadata = { ...(user.user_metadata as any), name: name.trim() };
  if (email?.trim())    update.email         = email.trim();
  if (password?.trim()) update.password      = password.trim();

  const { error } = await service.auth.admin.updateUserById(user.id, update);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
