// app/api/admin/consultants/route.ts
// CRUD for consultant users — super_admin only
//
// Source of truth:
//   admin_roles (role='consultant', school_id=null)  ← who is a consultant
//   consultant_profiles                               ← extra fields: code, mobile, pan, is_default
//
// The pre-existing `consultants` table in Supabase is NOT written to by this API.
// All reads and writes go through admin_roles + consultant_profiles only.

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
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  // Step 1: all rows in admin_roles where role = consultant
  const { data: roleRows, error } = await service
    .from('admin_roles')
    .select('id, user_id, created_at')
    .eq('role', 'consultant')
    .is('school_id', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!roleRows?.length) return NextResponse.json({ consultants: [] });

  const userIds = roleRows.map(r => r.user_id);

  // Step 2: auth user details (name + email) from Supabase Auth
  const userDetails: Record<string, any> = {};
  for (const uid of userIds) {
    try {
      const { data: u } = await service.auth.admin.getUserById(uid);
      if (u?.user) userDetails[uid] = u.user;
    } catch {}
  }

  // Step 3: consultant_profiles for extra fields
  const { data: profiles } = await service
    .from('consultant_profiles')
    .select('user_id, consultant_code, mobile_number, pan_number, is_default_consultant')
    .in('user_id', userIds);

  const profileMap: Record<string, any> = {};
  for (const p of profiles ?? []) profileMap[p.user_id] = p;

  // Step 4: school counts
  const { data: schools } = await service
    .from('schools')
    .select('consultant_id')
    .in('consultant_id', userIds);

  const schoolCounts: Record<string, number> = {};
  for (const s of schools ?? []) {
    if (s.consultant_id) schoolCounts[s.consultant_id] = (schoolCounts[s.consultant_id] ?? 0) + 1;
  }

  const consultants = roleRows.map(r => ({
    id:                    r.user_id,
    role_id:               r.id,
    email:                 userDetails[r.user_id]?.email ?? '—',
    name:                  userDetails[r.user_id]?.user_metadata?.name ?? '',
    created_at:            r.created_at,
    school_count:          schoolCounts[r.user_id] ?? 0,
    consultant_code:       profileMap[r.user_id]?.consultant_code       ?? null,
    mobile_number:         profileMap[r.user_id]?.mobile_number         ?? null,
    pan_number:            profileMap[r.user_id]?.pan_number            ?? null,
    is_default_consultant: profileMap[r.user_id]?.is_default_consultant ?? false,
  }));

  return NextResponse.json({ consultants });
}

// POST /api/admin/consultants — create auth user + admin_roles entry + consultant_profiles row
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { name, email, password, consultant_code, mobile_number, pan_number, is_default_consultant } = await req.json();

  if (!name?.trim() || !email?.trim() || !password?.trim())
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });

  if (!consultant_code?.trim())
    return NextResponse.json({ error: 'consultant_code is required' }, { status: 400 });

  const code = consultant_code.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9-]+$/.test(code))
    return NextResponse.json({ error: 'consultant_code must be lowercase letters, digits, or hyphens only' }, { status: 400 });

  // Check code uniqueness
  const { data: existingCode } = await service
    .from('consultant_profiles')
    .select('id')
    .eq('consultant_code', code)
    .maybeSingle();
  if (existingCode)
    return NextResponse.json({ error: 'Consultant code already in use' }, { status: 400 });

  // 1. Create Supabase auth user
  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email:         email.trim(),
    password:      password.trim(),
    email_confirm: true,
    user_metadata: { name: name.trim() },
  });
  if (authErr)
    return NextResponse.json(
      { error: authErr.message.includes('already') ? 'Email already registered' : authErr.message },
      { status: 400 }
    );

  // 2. Insert admin_roles row (role = consultant) — this is what makes them a consultant
  const { error: roleErr } = await service.from('admin_roles').insert({
    user_id:   newUser.user.id,
    role:      'consultant',
    school_id: null,
  });
  if (roleErr) {
    await service.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }

  // 3. If setting as default, unset any existing default first
  if (is_default_consultant) {
    await service
      .from('consultant_profiles')
      .update({ is_default_consultant: false })
      .eq('is_default_consultant', true);
  }

  // 4. Insert consultant_profiles row for extra fields
  const { error: profileErr } = await service.from('consultant_profiles').insert({
    user_id:               newUser.user.id,
    consultant_code:       code,
    mobile_number:         mobile_number?.trim() || null,
    pan_number:            pan_number?.trim()    || null,
    is_default_consultant: !!is_default_consultant,
  });
  if (profileErr) {
    // Rollback
    await service.from('admin_roles').delete().eq('user_id', newUser.user.id).eq('role', 'consultant');
    await service.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    consultant: {
      id:                    newUser.user.id,
      email:                 newUser.user.email,
      name:                  name.trim(),
      consultant_code:       code,
      mobile_number:         mobile_number?.trim() || null,
      pan_number:            pan_number?.trim()    || null,
      is_default_consultant: !!is_default_consultant,
    }
  }, { status: 201 });
}

// PATCH /api/admin/consultants — update name / password / profile fields
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id, name, password, consultant_code, mobile_number, pan_number, is_default_consultant } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // 1. Update auth user (name / password)
  const authUpdate: Record<string, any> = {};
  if (name)     authUpdate.user_metadata = { name: name.trim() };
  if (password) authUpdate.password      = password.trim();
  if (Object.keys(authUpdate).length) {
    const { error } = await service.auth.admin.updateUserById(id, authUpdate);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 2. Update / upsert consultant_profiles
  const profileUpdate: Record<string, any> = {};
  if (consultant_code !== undefined) {
    const code = consultant_code.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-]+$/.test(code))
      return NextResponse.json({ error: 'consultant_code must be lowercase letters, digits, or hyphens only' }, { status: 400 });
    profileUpdate.consultant_code = code;
  }
  if (mobile_number         !== undefined) profileUpdate.mobile_number         = mobile_number?.trim()  || null;
  if (pan_number            !== undefined) profileUpdate.pan_number            = pan_number?.trim()     || null;
  if (is_default_consultant !== undefined) {
    profileUpdate.is_default_consultant = !!is_default_consultant;
    if (is_default_consultant) {
      await service
        .from('consultant_profiles')
        .update({ is_default_consultant: false })
        .eq('is_default_consultant', true)
        .neq('user_id', id);
    }
  }

  if (Object.keys(profileUpdate).length) {
    const { error: profileErr } = await service
      .from('consultant_profiles')
      .upsert({ user_id: id, ...profileUpdate }, { onConflict: 'user_id' });
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/consultants — remove role + profile; un-assign schools
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  await service.from('admin_roles').delete().eq('user_id', id).eq('role', 'consultant');
  await service.from('consultant_profiles').delete().eq('user_id', id);
  await service.from('schools').update({ consultant_id: null }).eq('consultant_id', id);

  return NextResponse.json({ success: true });
}
