// app/api/admin/consultants/route.ts
// CRUD for consultant users — super_admin only
// Consultants can: create schools (web + mobile), view their assigned schools + reports

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

// GET /api/admin/consultants
// Returns all users with the 'consultant' role, along with their assigned school count
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  // Get all consultant role rows
  const { data: roleRows, error } = await service
    .from('admin_roles')
    .select('id, user_id, created_at')
    .eq('role', 'consultant')
    .is('school_id', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!roleRows?.length) return NextResponse.json({ consultants: [] });

  const userIds = roleRows.map(r => r.user_id);

  // Get auth user details (email) via admin API
  const userDetails: Record<string, any> = {};
  for (const uid of userIds) {
    try {
      const { data: u } = await service.auth.admin.getUserById(uid);
      if (u?.user) userDetails[uid] = u.user;
    } catch {}
  }

  // Count schools per consultant
  const { data: schools } = await service
    .from('schools')
    .select('consultant_id')
    .in('consultant_id', userIds);

  const schoolCounts: Record<string, number> = {};
  for (const s of schools ?? []) {
    if (s.consultant_id) schoolCounts[s.consultant_id] = (schoolCounts[s.consultant_id] ?? 0) + 1;
  }

  const consultants = roleRows.map(r => ({
    id:           r.user_id,
    role_id:      r.id,
    email:        userDetails[r.user_id]?.email ?? '—',
    name:         userDetails[r.user_id]?.user_metadata?.name ?? '',
    created_at:   r.created_at,
    school_count: schoolCounts[r.user_id] ?? 0,
  }));

  return NextResponse.json({ consultants });
}

// POST /api/admin/consultants
// Creates a new Supabase auth user with the 'consultant' role
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { name, email, password } = await req.json();

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }

  // Create Supabase auth user
  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email:         email.trim(),
    password:      password.trim(),
    email_confirm: true,
    user_metadata: { name: name.trim() },
  });

  if (authErr) {
    return NextResponse.json(
      { error: authErr.message.includes('already') ? 'Email already registered' : authErr.message },
      { status: 400 }
    );
  }

  // Assign 'consultant' role (no school_id — they operate across their own schools)
  const { error: roleErr } = await service.from('admin_roles').insert({
    user_id:   newUser.user.id,
    role:      'consultant',
    school_id: null,
  });

  if (roleErr) {
    // Rollback auth user
    await service.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }

  return NextResponse.json({
    consultant: {
      id:    newUser.user.id,
      email: newUser.user.email,
      name:  name.trim(),
    }
  }, { status: 201 });
}

// DELETE /api/admin/consultants
// Removes consultant role (does NOT delete the auth user)
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id } = await req.json(); // id = user_id of the consultant

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Remove consultant role
  await service
    .from('admin_roles')
    .delete()
    .eq('user_id', id)
    .eq('role', 'consultant');

  // Nullify consultant_id on their schools (schools remain, just un-assigned)
  await service
    .from('schools')
    .update({ consultant_id: null })
    .eq('consultant_id', id);

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/consultants — update name or password
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id, name, password } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, any> = {};
  if (name) update.user_metadata = { name: name.trim() };
  if (password) update.password = password.trim();

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await service.auth.admin.updateUserById(id, update);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
