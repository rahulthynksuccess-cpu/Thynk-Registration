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

// GET — list all admin users with their roles
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: roles } = await service
    .from('admin_roles')
    .select('id, role, created_at, school_id, schools(name, school_code), user_id')
    .order('created_at', { ascending: false });

  // Get auth users list for emails
  const { data: { users: authUsers } } = await service.auth.admin.listUsers();
  const emailMap = Object.fromEntries(authUsers.map((u: any) => [u.id, u.email]));

  const result = (roles ?? []).map((r: any) => ({
    ...r,
    email: emailMap[r.user_id] ?? '—',
  }));

  return NextResponse.json({ users: result });
}

// POST — create a new admin user and assign role
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { email, password, role, school_id } = await req.json();

  if (!email || !password || !role) return NextResponse.json({ error: 'email, password, role required' }, { status: 400 });
  if (role === 'school_admin' && !school_id) return NextResponse.json({ error: 'school_id required for school_admin' }, { status: 400 });

  // Create auth user
  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  // Assign role
  await service.from('admin_roles').insert({
    user_id:   newUser.user.id,
    role,
    school_id: role === 'super_admin' ? null : school_id,
  });

  return NextResponse.json({ success: true, user_id: newUser.user.id }, { status: 201 });
}

// DELETE — remove user and their roles
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { user_id, role_id } = await req.json();

  if (role_id) {
    // Just remove a specific role assignment
    await service.from('admin_roles').delete().eq('id', role_id);
  } else if (user_id) {
    // Remove all roles and delete auth user
    await service.from('admin_roles').delete().eq('user_id', user_id);
    await service.auth.admin.deleteUser(user_id);
  }

  return NextResponse.json({ success: true });
}
