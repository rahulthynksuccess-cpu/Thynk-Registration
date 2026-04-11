import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 300; // cache 5 minutes

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('schools')
    .select(`
      id, school_code, name, org_name, logo_url, branding, gateway_config, is_active,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active, valid_from, valid_until)
    `)
    .eq('school_code', params.code.toLowerCase())
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // Filter to only active, valid pricing
  const now = new Date().toISOString();
  const activePricing = (data.pricing as any[]).filter(
    (p) => p.is_active && (!p.valid_until || p.valid_until > now)
  );

  if (!activePricing.length) {
    return NextResponse.json({ error: 'No active pricing for this school' }, { status: 404 });
  }

  // Never expose gateway secrets to client
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
  });
}
