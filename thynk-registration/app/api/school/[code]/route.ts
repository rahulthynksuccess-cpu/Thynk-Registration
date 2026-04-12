import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 300;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const projectSlug = searchParams.get('project');

  let query = supabase
    .from('schools')
    .select(`
      id, school_code, name, org_name, logo_url, branding, gateway_config, is_active, is_registration_active, project_slug,
      country, city, state, status,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active, valid_from, valid_until)
    `)
    .eq('school_code', params.code.toLowerCase())
    .eq('is_active', true);

  // If project slug provided, scope to that project
  if (projectSlug) {
    query = query.eq('project_slug', projectSlug);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return NextResponse.json({ error: 'School not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const now = new Date().toISOString();
  const activePricing = (data.pricing as any[]).filter(
    (p) => p.is_active && (!p.valid_until || p.valid_until > now)
  );

  if (!activePricing.length) {
    return NextResponse.json({ error: 'No active pricing for this school' }, { status: 404, headers: CORS_HEADERS });
  }

  // ── Fetch project allowed_grades ──────────────────────────────────
  // Use project_slug from school row (or the query param) to look up allowed grades
  const slug = projectSlug ?? (data as any).project_slug;
  let allowedGrades: string[] = [];

  if (slug) {
    const { data: project } = await supabase
      .from('projects')
      .select('allowed_grades')
      .eq('slug', slug)
      .single();

    if (project?.allowed_grades?.length) {
      allowedGrades = project.allowed_grades as string[];
    }
  }

  // Fall back to all active grades if project has none configured
  if (!allowedGrades.length) {
    const { data: allGrades } = await supabase
      .from('grades')
      .select('name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    allowedGrades = (allGrades ?? []).map((g: any) => g.name);
  }

  const { gateway_config, ...safeSchool } = data;
  const publicGatewayConfig = {
    rzp_key_id: (gateway_config as any)?.rzp_key_id ?? process.env.RAZORPAY_KEY_ID,
    cf_mode:    (gateway_config as any)?.cf_mode    ?? 'production',
    eb_env:     (gateway_config as any)?.eb_env     ?? 'production',
  };

  return NextResponse.json({
    ...safeSchool,
    pricing: activePricing,
    public_gateway_config: publicGatewayConfig,
    allowed_grades: allowedGrades,
  }, { headers: CORS_HEADERS });
}
