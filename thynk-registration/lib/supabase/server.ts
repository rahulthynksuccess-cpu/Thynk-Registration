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
