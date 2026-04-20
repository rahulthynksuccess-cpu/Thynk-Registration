// app/api/admin/users/route.ts
// CRUD for admin users.
// Roles:
//   super_admin  — full access to everything, school_id = null
//   school_admin — scoped to one school (legacy)
//   sub_admin    — scoped to allowed_pages[] + allowed_school_ids[] (or all_schools=true)

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

// ── GET — list all admin users with roles & permissions ───────────
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  const { data: roles } = await service
    .from('admin_roles')
    .select('id, role, created_at, school_id, all_schools, allowed_pages, display_name, user_id, schools(id, name, school_code)')
    .order('created_at', { ascending: false });

  const { data: { users: authUsers } } = await service.auth.admin.listUsers();
  const emailMap = Object.fromEntries(authUsers.map((u: any) => [u.id, u.email]));

  // Group sub_admin rows by user_id (multiple school rows per user)
  const grouped: Record<string, any> = {};
  for (const r of roles ?? []) {
    const key = r.role === 'sub_admin' ? `sub::${r.user_id}` : `${r.id}`;
    if (r.role === 'sub_admin') {
      if (!grouped[key]) {
        grouped[key] = {
          id:            r.id,
          user_id:       r.user_id,
          role:          r.role,
          email:         emailMap[r.user_id] ?? '—',
          display_name:  r.display_name,
          allowed_pages: r.allowed_pages ?? [],
          all_schools:   r.all_schools,
          created_at:    r.created_at,
          school_ids:    [],
          school_names:  [],
          row_ids:       [],
        };
      }
      grouped[key].row_ids.push(r.id);
      if (r.school_id) {
        grouped[key].school_ids.push(r.school_id);
        grouped[key].school_names.push((r.schools as any)?.name ?? r.school_id);
      }
    } else {
      grouped[key] = {
        id:           r.id,
        user_id:      r.user_id,
        role:         r.role,
        email:        emailMap[r.user_id] ?? '—',
        display_name: r.display_name,
        school_id:    r.school_id,
        schools:      r.schools,
        created_at:   r.created_at,
      };
    }
  }

  return NextResponse.json({ users: Object.values(grouped) });
}

// ── POST — create a new admin user ────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const body = await req.json();
  const {
    email, password, role, display_name,
    all_schools = false,
    allowed_school_ids = [],
    allowed_pages = [],
    school_id,
  } = body;

  if (!email || !password || !role)
    return NextResponse.json({ error: 'email, password, role required' }, { status: 400 });
  if (role === 'school_admin' && !school_id)
    return NextResponse.json({ error: 'school_id required for school_admin' }, { status: 400 });
  if (role === 'sub_admin' && !all_schools && allowed_school_ids.length === 0)
    return NextResponse.json({ error: 'sub_admin needs all_schools=true or at least one school' }, { status: 400 });
  if (role === 'sub_admin' && allowed_pages.length === 0)
    return NextResponse.json({ error: 'sub_admin requires at least one allowed page' }, { status: 400 });

  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  const uid = newUser.user.id;

  if (role === 'sub_admin') {
    if (all_schools) {
      await service.from('admin_roles').insert({
        user_id: uid, role: 'sub_admin', school_id: null,
        all_schools: true, allowed_pages, display_name: display_name || null,
      });
    } else {
      await service.from('admin_roles').insert(
        allowed_school_ids.map((sid: string) => ({
          user_id: uid, role: 'sub_admin', school_id: sid,
          all_schools: false, allowed_pages, display_name: display_name || null,
        }))
      );
    }
  } else if (role === 'super_admin') {
    await service.from('admin_roles').insert({
      user_id: uid, role: 'super_admin', school_id: null,
      display_name: display_name || null,
    });
  } else {
    await service.from('admin_roles').insert({
      user_id: uid, role: 'school_admin', school_id,
      display_name: display_name || null,
    });
  }

  return NextResponse.json({ success: true, user_id: uid }, { status: 201 });
}

// ── PATCH — edit sub_admin permissions ────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { user_id, display_name, all_schools = false, allowed_school_ids = [], allowed_pages = [] } = await req.json();

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  // Replace all existing sub_admin rows for this user
  await service.from('admin_roles').delete().eq('user_id', user_id).eq('role', 'sub_admin');

  if (all_schools) {
    await service.from('admin_roles').insert({
      user_id, role: 'sub_admin', school_id: null,
      all_schools: true, allowed_pages, display_name: display_name || null,
    });
  } else if (allowed_school_ids.length) {
    await service.from('admin_roles').insert(
      allowed_school_ids.map((sid: string) => ({
        user_id, role: 'sub_admin', school_id: sid,
        all_schools: false, allowed_pages, display_name: display_name || null,
      }))
    );
  }

  return NextResponse.json({ success: true });
}

// ── DELETE — remove user and/or their roles ───────────────────────
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { user_id, role_id } = await req.json();

  if (role_id) {
    await service.from('admin_roles').delete().eq('id', role_id);
  } else if (user_id) {
    await service.from('admin_roles').delete().eq('user_id', user_id);
    await service.auth.admin.deleteUser(user_id);
  }

  return NextResponse.json({ success: true });
}
