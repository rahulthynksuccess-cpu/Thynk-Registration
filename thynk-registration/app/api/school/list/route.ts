// app/api/school/list/route.ts
// PUBLIC endpoint — no auth required
// Returns schools approved + active for registration, filtered by city/state (+ optional project)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 0; // no cache during debugging

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectSlug = (searchParams.get('project') || '').trim();
  const city        = (searchParams.get('city')    || '').trim();
  const state       = (searchParams.get('state')   || '').trim();

  const supabase = createServiceClient();

  let query = supabase
    .from('schools')
    .select(`
      id, school_code, name, city, state, country,
      status, is_active, is_registration_active, project_slug,
      branding, gateway_config,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active)
    `)
    .eq('status', 'approved')
    .eq('is_active', true)
    .eq('is_registration_active', true);

  // Scope to project if provided
  if (projectSlug) {
    query = query.eq('project_slug', projectSlug) as any;
  }

  // Filter by city/state using ilike (case-insensitive)
  if (city)  query = (query as any).ilike('city',  `%${city}%`);
  if (state) query = (query as any).ilike('state', `%${state}%`);

  const { data, error } = await (query as any).order('name', { ascending: true });

  if (error) {
    console.error('[/api/school/list] Supabase error:', error);
    return NextResponse.json({ error: error.message, schools: [] }, { status: 500, headers: CORS });
  }

  const allSchools = data ?? [];

  // Keep only schools that have at least one active pricing entry
  const schools = allSchools
    .filter((s: any) => (s.pricing as any[]).some((p: any) => p.is_active))
    .map((s: any) => ({
      id:                   s.id,
      school_code:          s.school_code,
      name:                 s.name,
      city:                 s.city,
      state:                s.state,
      country:              s.country,
      project_slug:         s.project_slug,
      branding:             s.branding ?? {},
      pricing:              (s.pricing as any[]).filter((p: any) => p.is_active),
      public_gateway_config: {
        pp_client_id: (s.gateway_config as any)?.pp_client_id ?? process.env.PAYPAL_CLIENT_ID ?? null,
      },
    }));

  console.log(`[/api/school/list] project=${projectSlug} city=${city} state=${state} → ${allSchools.length} total, ${schools.length} with active pricing`);

  return NextResponse.json({ schools, _debug: { total: allSchools.length, withPricing: schools.length, city, state, project: projectSlug } }, { headers: CORS });
}
