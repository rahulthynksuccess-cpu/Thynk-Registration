export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Try cookie-based auth (works from browser) AND Bearer token
  const service = createServiceClient();
  
  let userId: string | null = null;

  // 1. Try Bearer token
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user } } = await service.auth.getUser(token);
    userId = user?.id ?? null;
  }

  // 2. Try cookie session
  if (!userId) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {}
  }

  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check super admin
  const { data: roleRow } = await service
    .from('admin_roles').select('role')
    .eq('user_id', userId).eq('role', 'super_admin').is('school_id', null).maybeSingle();
  if (!roleRow) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });

  // Load all schools
  const { data: schools, error } = await service
    .from('schools')
    .select('id, school_code, project_slug, branding');

  if (error || !schools) return NextResponse.json({ error: error?.message ?? 'Load failed' }, { status: 500 });

  let updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const school of schools) {
    if (!school.school_code || !school.project_slug) { skipped++; continue; }

    const correctUrl = `https://thynksuccess.com/registration/${school.project_slug}/?school=${school.school_code}`;

    if (school.branding?.redirectURL === correctUrl) { skipped++; continue; }

    const { error: updateErr } = await service
      .from('schools')
      .update({ branding: { ...(school.branding ?? {}), redirectURL: correctUrl } })
      .eq('id', school.id);

    if (updateErr) errors.push(`${school.school_code}: ${updateErr.message}`);
    else updated++;
  }

  return NextResponse.json({
    success: true, total: schools.length, updated, skipped, errors,
    message: `Updated ${updated} schools. ${skipped} already correct or missing data.`,
  });
}
