// app/api/project/route.ts
// PUBLIC endpoint — no auth required
// Returns minimal project info (name, slug, allowed_grades) by slug
// Used by the standalone registration.html to show the program badge

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 300;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const slug = (new URL(req.url).searchParams.get('slug') || '').trim();

  if (!slug) {
    return NextResponse.json({ error: 'slug query param required' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, slug, status, allowed_grades')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return NextResponse.json({ project: null }, { status: 404, headers: CORS });
  }

  return NextResponse.json({ project: data }, { headers: CORS });
}
