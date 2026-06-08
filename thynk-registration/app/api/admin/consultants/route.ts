// app/api/admin/consultants/route.ts
// CRUD for consultant users — super_admin only
// Consultants can: create schools (web + mobile), view their assigned schools + reports
//
// NEW fields added to consultant_profiles table:
//   consultant_code, mobile_number, pan_number, is_default_consultant

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

  const { data: roleRows, error } = await service
    .from('admin_roles')
    .select('id, user_id, created_at')
    .eq('role', 'consultant')
    .is('school_id', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!roleRows?.length) return NextResponse.json({ consultants: [] });

  const userIds = roleRows.map(r => r.user_id);

  // Auth user details (name + email)
  const userDetails: Record<string, any> = {};
  for (const uid of userIds) {
    try {
      const { data: u } = await service.auth.admin.getUserById(uid);
      if (u?.user) userDetails[uid] = u.user;
    } catch {}
  }

  // Extra profile fields from consultant_profiles
  const { data: profiles } = await service
    .from('consultant_profiles')
    .select('user_id, consultant_code, mobile_number, pan_number, is_default_consultant, internal_remark')
    .in('user_id', userIds);

  const profileMap: Record<string, any> = {};
  for (const p of profiles ?? []) profileMap[p.user_id] = p;

  // School counts
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
    internal_remark:       profileMap[r.user_id]?.internal_remark       ?? null,
  }));

  return NextResponse.json({ consultants });
}

// POST /api/admin/consultants
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
    return NextResponse.json({ error: 'Consultant code: lowercase letters, digits or hyphens only' }, { status: 400 });

  // Check code is unique
  const { data: codeExists } = await service
    .from('consultant_profiles')
    .select('id')
    .eq('consultant_code', code)
    .maybeSingle();
  if (codeExists)
    return NextResponse.json({ error: 'Consultant code already in use' }, { status: 400 });

  // 1. Create auth user
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

  // 2. Write to admin_roles (source of truth — unchanged)
  const { error: roleErr } = await service.from('admin_roles').insert({
    user_id:   newUser.user.id,
    role:      'consultant',
    school_id: null,
  });
  if (roleErr) {
    await service.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }

  // 3. If setting as default, clear any existing default
  if (is_default_consultant) {
    await service
      .from('consultant_profiles')
      .update({ is_default_consultant: false })
      .eq('is_default_consultant', true);
  }

  // 4. Write extra fields to consultant_profiles
  const { error: profileErr } = await service.from('consultant_profiles').insert({
    user_id:               newUser.user.id,
    consultant_code:       code,
    mobile_number:         mobile_number?.trim() || null,
    pan_number:            pan_number?.trim()    || null,
    is_default_consultant: !!is_default_consultant,
  });
  if (profileErr) {
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

// PATCH /api/admin/consultants
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id, name, email, password, consultant_code, mobile_number, pan_number, is_default_consultant, internal_remark } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Update auth user (name / email / password)
  const authUpdate: Record<string, any> = {};
  if (name)     authUpdate.user_metadata = { name: name.trim() };
  if (password) authUpdate.password      = password.trim();
  if (email)    authUpdate.email         = email.trim();
  if (Object.keys(authUpdate).length) {
    const { error } = await service.auth.admin.updateUserById(id, authUpdate);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update consultant_profiles fields
  const profileUpdate: Record<string, any> = {};
  if (consultant_code !== undefined) {
    const code = consultant_code.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-]+$/.test(code))
      return NextResponse.json({ error: 'Consultant code: lowercase letters, digits or hyphens only' }, { status: 400 });
    profileUpdate.consultant_code = code;
  }
  if (mobile_number         !== undefined) profileUpdate.mobile_number         = mobile_number?.trim()  || null;
  if (pan_number            !== undefined) profileUpdate.pan_number            = pan_number?.trim()     || null;
  if (internal_remark       !== undefined) profileUpdate.internal_remark       = internal_remark?.trim() || null;
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

// DELETE /api/admin/consultants
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
