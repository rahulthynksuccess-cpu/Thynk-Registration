export const dynamic = 'force-dynamic';
/**
 * /api/payment/cleanup
 *
 * Recovers payments stuck in 'initiated' or 'pending' status.
 * Called by a Vercel cron job (vercel.json) every 30 minutes.
 * Also callable manually: GET /api/payment/cleanup?secret=CRON_SECRET
 *
 * For each stuck payment (>15 min old):
 *   - Razorpay  → verify order status via Razorpay API
 *   - Cashfree  → verify order status via Cashfree API
 *   - Easebuzz  → can't poll (no status API) — mark failed after 2hrs
 *   - PayPal    → verify order status via PayPal Orders API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fireTriggers } from '@/lib/triggers/fire';
import { verifyCashfreePayment } from '@/lib/payment/cashfree';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

async function getGatewayConfig(supabase: any, schoolId: string, provider: string) {
  const { data: schoolCfg } = await supabase
    .from('integration_configs').select('config')
    .eq('school_id', schoolId).eq('provider', provider).maybeSingle();
  if (schoolCfg?.config?.key_id) return schoolCfg.config;
  const { data: globalCfg } = await supabase
    .from('integration_configs').select('config')
    .is('school_id', null).eq('provider', provider).maybeSingle();
  return globalCfg?.config ?? {};
}

async function fireSuccess(supabase: any, payment: any, paymentId: string) {
  await supabase.from('payments').update({
    status:  'paid',
    paid_at: new Date().toISOString(),
  }).eq('id', paymentId);
  await supabase.from('registrations').update({ status: 'paid' })
    .eq('id', payment.registration_id);
  await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }).catch(() => {});
  await fireTriggers('registration.created', payment.registration_id, payment.school_id);
  await fireTriggers('payment.paid',         payment.registration_id, payment.school_id);
}

async function fireFailed(supabase: any, payment: any, paymentId: string) {
  await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentId);
  await supabase.from('registrations').update({ status: 'failed' })
    .eq('id', payment.registration_id);
  await fireTriggers('payment.failed', payment.registration_id, payment.school_id);
}

export async function GET(req: NextRequest) {
  // Auth: must have correct secret (set CRON_SECRET env var in Vercel)
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch payments stuck in initiated/pending for more than 15 minutes
  const cutoff15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const cutoff2h  = new Date(Date.now() - 2  * 60 * 60 * 1000).toISOString();

  const { data: stuckPayments } = await supabase
    .from('payments')
    .select('id, gateway, gateway_txn_id, school_id, registration_id, created_at')
    .in('status', ['initiated', 'pending'])
    .lt('created_at', cutoff15m)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!stuckPayments || stuckPayments.length === 0) {
    return NextResponse.json({ recovered: 0, failed: 0, message: 'No stuck payments found' });
  }

  let recovered = 0;
  let markedFailed = 0;
  const errors: string[] = [];

  for (const payment of stuckPayments) {
    try {
      // ── Razorpay ────────────────────────────────────────────────
      if (payment.gateway === 'razorpay' && payment.gateway_txn_id) {
        const gc = await getGatewayConfig(supabase, payment.school_id, 'razorpay');
        const keyId  = gc.key_id     ?? process.env.RAZORPAY_KEY_ID ?? '';
        const secret = gc.key_secret ?? process.env.RAZORPAY_KEY_SECRET ?? '';
        if (!keyId || !secret) continue;

        const creds  = Buffer.from(`${keyId}:${secret}`).toString('base64');
        // gateway_txn_id for razorpay is the order_id
        const res = await fetch(`https://api.razorpay.com/v1/orders/${payment.gateway_txn_id}/payments`, {
          headers: { Authorization: `Basic ${creds}` },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const captured = (data.items || []).find((p: any) => p.status === 'captured');
        if (captured) {
          await supabase.from('payments').update({ gateway_txn_id: captured.id })
            .eq('id', payment.id);
          await fireSuccess(supabase, payment, payment.id);
          recovered++;
        } else {
          // Order exists but no captured payment — still pending or failed
          const anyFailed = (data.items || []).some((p: any) => p.status === 'failed');
          if (anyFailed || new Date(payment.created_at) < new Date(cutoff2h)) {
            await fireFailed(supabase, payment, payment.id);
            markedFailed++;
          }
        }
        continue;
      }

      // ── Cashfree ────────────────────────────────────────────────
      if (payment.gateway === 'cashfree' && payment.gateway_txn_id) {
        const gc   = await getGatewayConfig(supabase, payment.school_id, 'cashfree');
        const appId  = gc.key_id     ?? process.env.CASHFREE_APP_ID ?? '';
        const secret = gc.key_secret ?? process.env.CASHFREE_SECRET_KEY ?? '';
        const raw    = gc.mode       ?? process.env.CASHFREE_MODE ?? 'production';
        const mode   = raw === 'live' ? 'production' : raw === 'test' ? 'sandbox' : raw;
        if (!appId || !secret) continue;

        const result = await verifyCashfreePayment(
          payment.gateway_txn_id, appId, secret, mode as 'production' | 'sandbox'
        );
        if (result.status === 'PAID') {
          await fireSuccess(supabase, payment, payment.id);
          recovered++;
        } else if (result.status === 'EXPIRED' || result.status === 'CANCELLED' ||
                   new Date(payment.created_at) < new Date(cutoff2h)) {
          await fireFailed(supabase, payment, payment.id);
          markedFailed++;
        }
        continue;
      }

      // ── Easebuzz ────────────────────────────────────────────────
      // Easebuzz has no polling API — mark failed after 2 hours
      if (payment.gateway === 'easebuzz') {
        if (new Date(payment.created_at) < new Date(cutoff2h)) {
          await fireFailed(supabase, payment, payment.id);
          markedFailed++;
        }
        continue;
      }

      // ── PayPal ──────────────────────────────────────────────────
      if (payment.gateway === 'paypal' && payment.gateway_txn_id) {
        const gc         = await getGatewayConfig(supabase, payment.school_id, 'paypal');
        const clientId   = gc.key_id     ?? process.env.PAYPAL_CLIENT_ID ?? '';
        const clientSecret = gc.key_secret ?? process.env.PAYPAL_CLIENT_SECRET ?? '';
        if (!clientId || !clientSecret) continue;

        const ppMode = gc.mode === 'test' ? 'sandbox' : 'live';
        const base   = ppMode === 'sandbox'
          ? 'https://api-m.sandbox.paypal.com'
          : 'https://api-m.paypal.com';

        // Get OAuth token
        const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!tokenRes.ok) continue;
        const { access_token } = await tokenRes.json();

        // Check order status
        const orderRes = await fetch(`${base}/v2/checkout/orders/${payment.gateway_txn_id}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!orderRes.ok) continue;
        const order = await orderRes.json();

        if (order.status === 'COMPLETED') {
          await fireSuccess(supabase, payment, payment.id);
          recovered++;
        } else if (order.status === 'VOIDED' || order.status === 'EXPIRED' ||
                   new Date(payment.created_at) < new Date(cutoff2h)) {
          await fireFailed(supabase, payment, payment.id);
          markedFailed++;
        }
        continue;
      }

    } catch (err: any) {
      errors.push(`${payment.id}: ${err.message}`);
    }
  }

  console.log(`[payment/cleanup] recovered=${recovered} failed=${markedFailed} errors=${errors.length}`);

  return NextResponse.json({
    recovered,
    failed:  markedFailed,
    checked: stuckPayments.length,
    errors:  errors.length > 0 ? errors : undefined,
  });
}
