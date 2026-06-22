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
    .maybeSingle();          // .single() throws PGRST116 when 0 rows; .maybeSingle() returns null
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
    .in('role', ['super_admin', 'sub_admin', 'school_admin', 'consultant'])
    .order('created_at', { ascending: false });

  // listUsers() returns max 100 by default — paginate to get all users
  const emailMap: Record<string, string> = {};
  let page = 1;
  while (true) {
    const { data: { users: pageUsers } } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    pageUsers.forEach((u: any) => { emailMap[u.id] = u.email; });
    if (pageUsers.length < 1000) break;
    page++;
  }

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
      // For consultant, super_admin, school_admin — one row per entry
      // Skip duplicate consultant entries (consultant role may have multiple rows per user)
      if (r.role === 'consultant') {
        const cKey = `consultant::${r.user_id}`;
        if (!grouped[cKey]) {
          grouped[cKey] = {
            id:           r.id,
            user_id:      r.user_id,
            role:         'consultant',
            email:        emailMap[r.user_id] ?? '—',
            display_name: r.display_name,
            created_at:   r.created_at,
          };
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
  // NOTE: sub_admin school access is optional — they can be page-restricted only (all_schools=true or no schools)
  if (role === 'sub_admin' && allowed_pages.length === 0)
    return NextResponse.json({ error: 'sub_admin requires at least one allowed page' }, { status: 400 });

  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  // Note: we deliberately do NOT return any session/token data from this endpoint
  // to prevent the browser Supabase client from picking up the new user's session.

  const uid = newUser.user.id;

  if (role === 'sub_admin') {
    if (all_schools || allowed_school_ids.length === 0) {
      // all_schools=true OR no specific schools → single row, school_id=null
      const { error: insErr } = await service.from('admin_roles').insert({
        user_id: uid, role: 'sub_admin', school_id: null,
        all_schools: !!all_schools, allowed_pages, display_name: display_name || null,
      });
      if (insErr) {
        console.error('[users/POST] admin_roles insert failed:', insErr);
        return NextResponse.json({ error: 'User created but role assignment failed: ' + insErr.message }, { status: 500 });
      }
    } else {
      // Specific schools selected — one row per school
      const { error: insErr } = await service.from('admin_roles').insert(
        allowed_school_ids.map((sid: string) => ({
          user_id: uid, role: 'sub_admin', school_id: sid,
          all_schools: false, allowed_pages, display_name: display_name || null,
        }))
      );
      if (insErr) {
        console.error('[users/POST] admin_roles multi-school insert failed:', insErr);
        return NextResponse.json({ error: 'User created but role assignment failed: ' + insErr.message }, { status: 500 });
      }
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

  if (all_schools || allowed_school_ids.length === 0) {
    // all_schools=true OR no specific schools → single row with school_id=null
    await service.from('admin_roles').insert({
      user_id, role: 'sub_admin', school_id: null,
      all_schools: !!all_schools, allowed_pages, display_name: display_name || null,
    });
  } else {
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
