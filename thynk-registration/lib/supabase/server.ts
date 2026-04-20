import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';

// ── Cookie-based client (safe for GET handlers and Server Components) ─────────
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// ── Service client (bypasses RLS — use only server-side) ─────────────────────
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Token-based auth (reliable for POST/PATCH/DELETE Route Handlers) ─────────
// Next.js 14 App Router makes the cookie store READ-ONLY inside mutation handlers.
// Supabase SSR cannot refresh/write the token back → auth.getUser() returns null.
// Fix: client sends Authorization: Bearer <access_token>; server validates directly.
export async function getUserFromRequest(req: NextRequest) {
  // 1. Try Authorization: Bearer header first (most reliable)
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const service = createServiceClient();
    const { data: { user }, error } = await service.auth.getUser(token);
    if (!error && user) return user;
  }

  // 2. Fallback: try reading the session from cookies (works for GETs)
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
  } catch {}

  return null;
}

// ── Admin permission helper ───────────────────────────────────────────────────
// Returns resolved permissions for any admin role, including sub_admin page/school scoping.
export interface AdminPermissions {
  isSuperAdmin:     boolean;
  isSubAdmin:       boolean;
  isSchoolAdmin:    boolean;
  allowedPages:     string[] | null;  // null = all pages allowed
  allowedSchoolIds: string[] | null;  // null = all schools allowed
}

export async function getAdminPermissions(req: NextRequest): Promise<AdminPermissions | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;

  const service = createServiceClient();
  const { data: rows } = await service
    .from('admin_roles')
    .select('role, school_id, all_schools, allowed_pages')
    .eq('user_id', user.id);

  if (!rows?.length) return null;

  const isSuperAdmin  = rows.some((r: any) => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin    = rows.some((r: any) => r.role === 'sub_admin');
  const isSchoolAdmin = rows.some((r: any) => r.role === 'school_admin');

  if (isSuperAdmin) {
    return { isSuperAdmin: true, isSubAdmin: false, isSchoolAdmin: false, allowedPages: null, allowedSchoolIds: null };
  }

  if (isSubAdmin) {
    const subRows    = rows.filter((r: any) => r.role === 'sub_admin');
    const allSchools = subRows.some((r: any) => r.all_schools);
    const allowedPages = subRows[0]?.allowed_pages ?? null;
    const schoolIds  = allSchools ? null : subRows.map((r: any) => r.school_id).filter(Boolean) as string[];
    return { isSuperAdmin: false, isSubAdmin: true, isSchoolAdmin: false, allowedPages, allowedSchoolIds: schoolIds };
  }

  if (isSchoolAdmin) {
    const schoolIds = rows.filter((r: any) => r.role === 'school_admin' && r.school_id).map((r: any) => r.school_id as string);
    return { isSuperAdmin: false, isSubAdmin: false, isSchoolAdmin: true, allowedPages: null, allowedSchoolIds: schoolIds };
  }

  return null;
}
