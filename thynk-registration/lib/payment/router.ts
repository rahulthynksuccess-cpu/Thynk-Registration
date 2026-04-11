import { createServiceClient } from '@/lib/supabase/server';
import type { GatewayKey } from '@/lib/types';

export interface ResolvedGateway {
  provider: GatewayKey;
  config: Record<string, any>;
  priority: number;
}

/**
 * Returns gateways for a school, ordered by priority.
 * Falls back to global configs (school_id IS NULL) if school has none.
 * Currency = 'INR'  → domestic gateways (razorpay, cashfree, easebuzz)
 * Currency != 'INR' → international (paypal; razorpay also supports USD)
 */
export async function resolveGateways(
  schoolId: string,
  currency: string = 'INR'
): Promise<ResolvedGateway[]> {
  const supabase = createServiceClient();

  // Fetch school-specific configs first, then fall back to global
  const { data, error } = await supabase
    .from('integration_configs')
    .select('provider, config, priority, school_id')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .eq('is_active', true)
    .in('provider', ['razorpay', 'cashfree', 'easebuzz', 'paypal'])
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true });

  if (error || !data?.length) {
    // Hard fallback to env vars if nothing in DB
    return buildEnvFallback(currency);
  }

  // Prefer school-specific over global (dedup by provider)
  const seen = new Set<string>();
  const configs: ResolvedGateway[] = [];
  for (const row of data) {
    if (!seen.has(row.provider)) {
      seen.add(row.provider);
      configs.push({ provider: row.provider as GatewayKey, config: row.config, priority: row.priority });
    }
  }

  // Filter by currency
  return configs.filter(c => {
    if (currency !== 'INR') return ['paypal', 'razorpay'].includes(c.provider);
   return c.provider !== ('paypal' as string);
  });
}

/**
 * Get the top-priority gateway for a school.
 * Tries each in order; returns first available config with credentials.
 */
export async function resolveGateway(
  schoolId: string,
  currency: string = 'INR'
): Promise<ResolvedGateway> {
  const gateways = await resolveGateways(schoolId, currency);
  if (!gateways.length) {
    throw new Error('No active payment gateway configured for this school.');
  }
  return gateways[0];
}

/** Extract Razorpay credentials from config + env fallback */
export function getRazorpayCredentials(config: Record<string, any>): { keyId: string; keySecret: string } {
  return {
    keyId:     config.rzp_key_id     ?? process.env.RAZORPAY_KEY_ID!,
    keySecret: config.rzp_key_secret ?? process.env.RAZORPAY_KEY_SECRET!,
  };
}

/** Extract Cashfree credentials from config + env fallback */
export function getCashfreeCredentials(config: Record<string, any>): { appId: string; secretKey: string; mode: 'production' | 'sandbox' } {
  return {
    appId:     config.cf_app_id  ?? process.env.CASHFREE_APP_ID!,
    secretKey: config.cf_secret  ?? process.env.CASHFREE_SECRET_KEY!,
    mode:      config.cf_mode    ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'),
  };
}

/** Extract Easebuzz credentials from config + env fallback */
export function getEasebuzzCredentials(config: Record<string, any>): { key: string; salt: string; env: 'production' | 'test' } {
  return {
    key:  config.eb_key  ?? process.env.EASEBUZZ_KEY!,
    salt: config.eb_salt ?? process.env.EASEBUZZ_SALT!,
    env:  config.eb_env  ?? (process.env.EASEBUZZ_ENV as 'production' | 'test') ?? 'production',
  };
}

/** Extract PayPal credentials from config + env fallback */
export function getPaypalCredentials(config: Record<string, any>): { clientId: string; clientSecret: string; mode: 'live' | 'sandbox' } {
  return {
    clientId:     config.pp_client_id     ?? process.env.PAYPAL_CLIENT_ID!,
    clientSecret: config.pp_client_secret ?? process.env.PAYPAL_CLIENT_SECRET!,
    mode:         config.pp_mode          ?? 'live',
  };
}

// Env-based fallback when no DB configs exist
function buildEnvFallback(currency: string): ResolvedGateway[] {
  const gateways: ResolvedGateway[] = [];
  if (currency === 'INR') {
    if (process.env.CASHFREE_APP_ID)  gateways.push({ provider: 'cashfree',  config: {}, priority: 0 });
    if (process.env.RAZORPAY_KEY_ID)  gateways.push({ provider: 'razorpay',  config: {}, priority: 1 });
    if (process.env.EASEBUZZ_KEY)     gateways.push({ provider: 'easebuzz',  config: {}, priority: 2 });
  } else {
    if (process.env.PAYPAL_CLIENT_ID) gateways.push({ provider: 'paypal',    config: {}, priority: 0 });
    if (process.env.RAZORPAY_KEY_ID)  gateways.push({ provider: 'razorpay',  config: {}, priority: 1 });
  }
  return gateways;
}
