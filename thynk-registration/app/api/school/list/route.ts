// app/api/school/list/route.ts
// PUBLIC endpoint — no auth required
// Returns schools that are approved + active for registration, filtered by project/city/state

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 60;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectSlug = (searchParams.get('project') || '').trim();
  const city        = (searchParams.get('city')    || '').trim();
  const state       = (searchParams.get('state')   || '').trim();

  if (!projectSlug) {
    return NextResponse.json(
      { error: 'project param required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const supabase = createServiceClient();

  let query = supabase
    .from('schools')
    .select(`
      id, school_code, name, city, state, country,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active)
    `)
    .eq('project_slug', projectSlug)
    .eq('status', 'approved')
    .eq('is_active', true)
    .eq('is_registration_active', true);

  if (city)  query = (query as any).ilike('city',  city);
  if (state) query = (query as any).ilike('state', state);

  const { data, error } = await (query as any).order('name', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // Only return schools with at least one active pricing entry
  const schools = (data ?? [])
    .filter((s: any) => (s.pricing as any[]).some((p: any) => p.is_active))
    .map((s: any) => ({
      ...s,
      pricing: (s.pricing as any[]).filter((p: any) => p.is_active),
    }));

  return NextResponse.json({ schools }, { headers: CORS_HEADERS });
}
