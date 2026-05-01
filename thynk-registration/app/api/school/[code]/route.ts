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

  // ── Fetch PayPal client ID ────────────────────────────────────────
  // Only the public client_id is safe to expose to the browser; secret stays server-side.
  let ppClientId: string | null = process.env.PAYPAL_CLIENT_ID ?? null; // env fallback
  try {
    const { data: ppCfg } = await supabase
      .from('integration_configs')
      .select('config, is_active')
      .eq('school_id', data.id)
      .eq('provider', 'paypal')
      .maybeSingle();
    if (ppCfg?.is_active && (ppCfg.config as any)?.pp_client_id) {
      ppClientId = (ppCfg.config as any).pp_client_id as string;
    }
  } catch { /* no paypal integration row — use env fallback above */ }

  // ── Fetch gateway sequence from integration_configs ───────────────
  // This is the source of truth for PG priority set in Admin → Integrations.
  // It overrides whatever is stored in pricing.gateway_sequence so that
  // drag-and-drop reordering in the admin panel is immediately reflected
  // on the checkout page without needing to update every pricing row.
  let gatewaySequence: string[] = [];
  try {
    const PG_PROVIDERS = ['easebuzz', 'razorpay', 'cashfree'];
    const { data: gwCfgs } = await supabase
      .from('integration_configs')
      .select('provider, priority, is_active, config')
      .or(`school_id.eq.${data.id},school_id.is.null`)  // school-specific first, then global
      .in('provider', PG_PROVIDERS)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    // gateway_labels: { razorpay: "Recommended", cashfree: "Fastest Refund", ... }
    const gatewayLabels: Record<string, string> = {};

    if (gwCfgs?.length) {
      // Deduplicate: prefer school-specific row over global row for same provider
      const seen = new Set<string>();
      const sorted = [...gwCfgs].sort((a: any, b: any) => {
        // school-specific rows (non-null school_id) win over global (null school_id)
        if (a.school_id && !b.school_id) return -1;
        if (!a.school_id && b.school_id) return 1;
        return (a.priority ?? 99) - (b.priority ?? 99);
      });
      for (const row of sorted as any[]) {
        if (!seen.has(row.provider)) {
          seen.add(row.provider);
          gatewaySequence.push(row.provider);
          // Carry through the optional checkout label set in Admin → Integrations
          const label = (row.config as any)?.pg_label;
          if (label && typeof label === 'string' && label.trim()) {
            gatewayLabels[row.provider] = label.trim();
          }
        }
      }
    }
  } catch { /* fall through — PaymentStep will use pricing.gateway_sequence as fallback */ }

  const publicGatewayConfig = {
    rzp_key_id:       (gateway_config as any)?.rzp_key_id ?? process.env.RAZORPAY_KEY_ID,
    cf_mode:          (gateway_config as any)?.cf_mode    ?? 'production',
    eb_env:           (gateway_config as any)?.eb_env     ?? 'production',
    pp_client_id:     ppClientId,
    // ✅ FIX: admin-configured PG order, consumed by PaymentStep & RegistrationCard
    gateway_sequence: gatewaySequence.length ? gatewaySequence : null,
    // Optional per-gateway checkout labels set in Admin → Integrations
    gateway_labels:   Object.keys(gatewayLabels).length ? gatewayLabels : null,
  };

  return NextResponse.json({
    ...safeSchool,
    pricing: activePricing,
    public_gateway_config: publicGatewayConfig,
    allowed_grades: allowedGrades,
  }, { headers: CORS_HEADERS });
}
