// app/api/payment/verify/route.ts
// CHANGES:
//   1. Reads gateway credentials from integration_configs table (Admin → Integrations UI)
//      Falls back to Vercel env vars only if not configured in UI
//   2. All successful payments redirect to https://www.thynksuccess.com/registration/success
//   3. Cashfree mode reads from integration_configs.config.mode or CASHFREE_MODE env var
//   4. GET also supports ?poll=true for frontend status polling on delayed responses

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpaySignature } from '@/lib/payment/razorpay';
import { verifyCashfreePayment } from '@/lib/payment/cashfree';

const SUCCESS_URL = 'https://www.thynksuccess.com/registration/success';
const FALLBACK_URL = 'https://www.thynksuccess.com';

// ── Load gateway credentials from integration_configs table ───────────────────
async function getGatewayConfig(supabase: any, schoolId: string, provider: string) {
  const { data } = await supabase
    .from('integration_configs')
    .select('config, is_active')
    .eq('school_id', schoolId)
    .eq('provider', provider)
    .single();
  return data ?? null;
}

// ── POST — called by client after Razorpay success callback ───────────────────
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();
  const { paymentId, gateway, gatewayTxnId, razorpayOrderId, razorpaySignature } = body;

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(*), school_id')
    .eq('id', paymentId)
    .single();

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  let verified  = false;
  let newStatus: 'paid' | 'failed' = 'failed';
  let txnId     = gatewayTxnId ?? payment.gateway_txn_id;

  if (gateway === 'razorpay' && razorpayOrderId && razorpaySignature && gatewayTxnId) {
    // key_secret = Key Secret in Integrations UI
    const rzpConfig = await getGatewayConfig(supabase, payment.school_id, 'razorpay');
    const secret    = rzpConfig?.config?.key_secret ?? process.env.RAZORPAY_KEY_SECRET!;
    verified  = verifyRazorpaySignature(razorpayOrderId, gatewayTxnId, razorpaySignature, secret);
    newStatus = verified ? 'paid' : 'failed';
    txnId     = gatewayTxnId;
  }

  await supabase.from('payments').update({
    status:         newStatus,
    gateway_txn_id: txnId,
    paid_at:        newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', paymentId);

  await supabase.from('registrations').update({
    status: newStatus,
  }).eq('id', payment.registration_id);

  if (newStatus === 'paid') {
    await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }).catch(() => {});
  }

  return NextResponse.json({ success: true, status: newStatus });
}

// ── GET — redirect return URL used by Cashfree / Easebuzz after payment ────────
// Also supports ?poll=true for frontend status polling (no redirect, returns JSON)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');
  const gw        = searchParams.get('gw');
  const status    = searchParams.get('status');
  const poll      = searchParams.get('poll') === 'true'; // frontend polling mode

  if (!paymentId) {
    if (poll) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
    return NextResponse.redirect(`${FALLBACK_URL}?error=missing_payment`);
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(school_id, schools(school_code, project_slug))')
    .eq('id', paymentId)
    .single();

  if (!payment) {
    if (poll) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    return NextResponse.redirect(`${FALLBACK_URL}?error=not_found`);
  }

  // ── If already paid (e.g. webhook beat the redirect) — fast return ───────────
  if (payment.status === 'paid') {
    if (poll) return NextResponse.json({ status: 'paid', gateway: payment.gateway });
    return NextResponse.redirect(SUCCESS_URL);
  }

  // ── Cashfree — verify with gateway API on redirect ───────────────────────────
  if (gw === 'cashfree') {
    try {
      // key_id = App ID, key_secret = Secret Key, mode = sandbox|production in Integrations UI
      const cfConfig  = await getGatewayConfig(supabase, payment.school_id, 'cashfree');
      const appId     = cfConfig?.config?.key_id     ?? process.env.CASHFREE_APP_ID!;
      const secret    = cfConfig?.config?.key_secret ?? process.env.CASHFREE_SECRET_KEY!;
      const mode      = cfConfig?.config?.mode       ?? process.env.CASHFREE_MODE ?? 'production';

      const result    = await verifyCashfreePayment(payment.gateway_txn_id!, appId, secret, mode as 'production' | 'sandbox');
      const newStatus = result.status === 'PAID' ? 'paid' : 'failed';

      await supabase.from('payments').update({
        status:  newStatus,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', paymentId);

      await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);

      if (newStatus === 'paid') {
        await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }).catch(() => {});
      }

      if (poll) return NextResponse.json({ status: newStatus, gateway: 'cashfree' });

      return NextResponse.redirect(
        newStatus === 'paid' ? SUCCESS_URL : `${FALLBACK_URL}?payment=failed`
      );
    } catch {
      if (poll) return NextResponse.json({ status: 'error', gateway: 'cashfree' });
      return NextResponse.redirect(`${FALLBACK_URL}?payment=error`);
    }
  }

  // ── Easebuzz — status comes from redirect URL param ───────────────────────────
  if (gw === 'easebuzz') {
    const newStatus = status === 'success' ? 'paid' : 'failed';

    await supabase.from('payments').update({
      status:  newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', paymentId);

    await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);

    if (newStatus === 'paid') {
      await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }).catch(() => {});
    }

    if (poll) return NextResponse.json({ status: newStatus, gateway: 'easebuzz' });

    return NextResponse.redirect(
      newStatus === 'paid' ? SUCCESS_URL : `${FALLBACK_URL}?payment=failed`
    );
  }

  if (poll) return NextResponse.json({ status: payment.status, gateway: payment.gateway });
  return NextResponse.redirect(FALLBACK_URL);
}
