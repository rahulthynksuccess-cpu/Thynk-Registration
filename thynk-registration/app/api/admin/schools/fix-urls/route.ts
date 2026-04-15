/**
 * POST /api/admin/schools/fix-urls
 * One-time migration: updates branding.redirectURL for ALL schools to use
 * the correct ?school= query-param format on thynksuccess.com (no www).
 * Super admin only. Safe to run multiple times.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).maybeSingle();
  if (!roleRow) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });

  // Load all schools with their branding and project_slug
  const { data: schools, error } = await service
    .from('schools')
    .select('id, school_code, project_slug, branding');

  if (error || !schools) return NextResponse.json({ error: error?.message }, { status: 500 });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const school of schools) {
    if (!school.school_code || !school.project_slug) { skipped++; continue; }

    const correctUrl = `https://thynksuccess.com/registration/${school.project_slug}/?school=${school.school_code}`;

    // Skip if already correct
    if (school.branding?.redirectURL === correctUrl) { skipped++; continue; }

    const newBranding = { ...(school.branding ?? {}), redirectURL: correctUrl };

    const { error: updateErr } = await service
      .from('schools')
      .update({ branding: newBranding })
      .eq('id', school.id);

    if (updateErr) {
      errors.push(`${school.school_code}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    success: true,
    total: schools.length,
    updated,
    skipped,
    errors,
    message: `Updated ${updated} schools. ${skipped} already correct or missing data.`,
  });
}
