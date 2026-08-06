// app/api/admin/users/reset-password/route.ts
// Allows a super_admin to reset the password of any admin user.

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

// ── POST — reset a user's password ─────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { user_id, new_password } = await req.json();

  if (!user_id || !new_password)
    return NextResponse.json({ error: 'user_id and new_password required' }, { status: 400 });

  if (new_password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  // Prevent super admin from resetting their own password via this route
  if (user_id === admin.id)
    return NextResponse.json({ error: 'Use your profile settings to change your own password' }, { status: 400 });

  const { error } = await service.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
