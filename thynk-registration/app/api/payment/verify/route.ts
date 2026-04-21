// app/api/payment/verify/route.ts
//
// GET  — redirect return URL for Cashfree and Easebuzz after payment
//         Easebuzz POSTs to this URL, Cashfree redirects GET
// POST — two cases handled by gw param:
//         ?gw=razorpay  → client-side signature verify after Razorpay checkout
//         ?gw=easebuzz  → Easebuzz surl/furl POST callback with hash verify

import { NextRequest, NextResponse } from 'next/server';
import { fireTriggers } from '@/lib/triggers/fire';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpaySignature } from '@/lib/payment/razorpay';
import { verifyCashfreePayment } from '@/lib/payment/cashfree';
import { verifyEasebuzzWebhookHash } from '@/lib/payment/easebuzz';

const SUCCESS_URL  = 'https://www.thynksuccess.com/registration/success';
const FALLBACK_URL = 'https://www.thynksuccess.com';

// ── Load gateway credentials ──────────────────────────────────────────────────
async function getGatewayConfig(supabase: any, schoolId: string, provider: string) {
  const { data: schoolCfg } = await supabase
    .from('integration_configs').select('config, is_active')
    .eq('school_id', schoolId).eq('provider', provider).maybeSingle();
  if (schoolCfg) return schoolCfg;
  const { data: globalCfg } = await supabase
    .from('integration_configs').select('config, is_active')
    .is('school_id', null).eq('provider', provider).maybeSingle();
  return globalCfg ?? null;
}

// ── Helper: fire registration.created + payment.paid together ─────────────────
// Both are always fired together on success so the student gets:
//   1. registration confirmation message  (registration.created trigger)
//   2. payment confirmation message       (payment.paid trigger)
async function fireSuccessTriggers(registrationId: string, schoolId: string) {
  await fireTriggers('registration.created', registrationId, schoolId);
  await fireTriggers('payment.paid',         registrationId, schoolId);
}

// ── POST handler ──────────────────────────────────────────────────────────────
// Handles two cases:
//   1. ?gw=easebuzz  → Easebuzz POSTs form data to surl/furl
//   2. no gw param   → Razorpay client sends JSON after checkout success
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gw        = searchParams.get('gw');
  const paymentId = searchParams.get('paymentId');

  const supabase = createServiceClient();

  // ── Case 1: Easebuzz POST callback ────────────────────────────────────────
  if (gw === 'easebuzz') {
    if (!paymentId) return NextResponse.redirect(`${FALLBACK_URL}?error=missing_payment`);

    const { data: payment } = await supabase
      .from('payments').select('id, status, registration_id, school_id')
      .eq('id', paymentId).single();

    if (!payment) return NextResponse.redirect(`${FALLBACK_URL}?error=not_found`);
    if (payment.status === 'paid') return NextResponse.redirect(SUCCESS_URL); // already processed

    // Parse application/x-www-form-urlencoded POST body from Easebuzz
    let bodyData: Record<string, string> = {};
    try {
      const raw = await req.text();
      new URLSearchParams(raw).forEach((v, k) => { bodyData[k] = v; });
    } catch {
      console.error('[Easebuzz POST] Failed to parse body');
      return NextResponse.redirect(`${FALLBACK_URL}?payment=error`);
    }

    console.log(`[Easebuzz POST] paymentId=${paymentId} status=${bodyData.status} txnid=${bodyData.txnid}`);

    // Verify response hash
    const ebConfig  = await getGatewayConfig(supabase, payment.school_id, 'easebuzz');
    const salt      = ebConfig?.config?.key_secret ?? process.env.EASEBUZZ_SALT ?? '';
    const hashValid = salt ? verifyEasebuzzWebhookHash(bodyData, salt) : true;

    if (!hashValid) {
      console.error('[Easebuzz POST] Hash mismatch — rejecting');
      return NextResponse.redirect(`${FALLBACK_URL}?payment=failed`);
    }

    const newStatus: 'paid' | 'failed' =
      (bodyData.status ?? '').toLowerCase() === 'success' ? 'paid' : 'failed';

    await supabase.from('payments').update({
      status:           newStatus,
      gateway_txn_id:   bodyData.txnid || payment.gateway_txn_id || null,
      gateway_response: bodyData,
      paid_at:          newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', paymentId);

    await supabase.from('registrations').update({ status: newStatus })
      .eq('id', payment.registration_id);

    if (newStatus === 'paid') {
      try { await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }); } catch (_) {}
      await fireSuccessTriggers(payment.registration_id, payment.school_id);
    } else {
      await fireTriggers('payment.failed', payment.registration_id, payment.school_id);
    }

    return NextResponse.redirect(newStatus === 'paid' ? SUCCESS_URL : `${FALLBACK_URL}?payment=failed`);
  }

  // ── Case 2: Razorpay client-side verify (JSON body) ───────────────────────
  const body = await req.json().catch(() => ({}));
  const { paymentId: bodyPid, gateway, gatewayTxnId, razorpayOrderId, razorpaySignature } = body;
  const pid = bodyPid ?? paymentId;

  if (!pid) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });

  const { data: payment } = await supabase
    .from('payments').select('*, registrations(*), school_id').eq('id', pid).single();

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  let verified  = false;
  let newStatus: 'paid' | 'failed' = 'failed';
  const txnId   = gatewayTxnId ?? payment.gateway_txn_id;

  if (gateway === 'razorpay' && razorpayOrderId && razorpaySignature && gatewayTxnId) {
    const rzpConfig = await getGatewayConfig(supabase, payment.school_id, 'razorpay');
    const secret    = rzpConfig?.config?.key_secret ?? process.env.RAZORPAY_KEY_SECRET!;
    verified        = verifyRazorpaySignature(razorpayOrderId, gatewayTxnId, razorpaySignature, secret);

    // Fallback: verify directly with Razorpay API if signature fails
    if (!verified && gatewayTxnId && rzpConfig?.config?.key_id) {
      try {
        const keyId  = rzpConfig.config.key_id ?? process.env.RAZORPAY_KEY_ID!;
        const creds  = Buffer.from(`${keyId}:${secret}`).toString('base64');
        const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${gatewayTxnId}`, {
          headers: { Authorization: `Basic ${creds}` },
        });
        if (rzpRes.ok) {
          const d = await rzpRes.json();
          verified = d.status === 'captured' && d.order_id === razorpayOrderId;
        }
      } catch { /* fall through */ }
    }
    newStatus = verified ? 'paid' : 'failed';
  }

  await supabase.from('payments').update({
    status:         newStatus,
    gateway_txn_id: txnId,
    paid_at:        newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', pid);

  await supabase.from('registrations').update({ status: newStatus })
    .eq('id', payment.registration_id);

  if (newStatus === 'paid') {
    try { await supabase.rpc('decrement_discount_usage', { p_payment_id: pid }); } catch (_) {}
    await fireSuccessTriggers(payment.registration_id, payment.school_id);
  } else {
    await fireTriggers('payment.failed', payment.registration_id, payment.school_id);
  }

  return NextResponse.json({ success: true, status: newStatus });
}

// ── GET handler ───────────────────────────────────────────────────────────────
// Handles Cashfree redirect and Easebuzz GET redirect (fallback if POST not used).
// Also supports ?poll=true for frontend status polling.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');
  const gw        = searchParams.get('gw');
  const status    = searchParams.get('status');
  const poll      = searchParams.get('poll') === 'true';

  if (!paymentId) {
    if (poll) return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
    return NextResponse.redirect(`${FALLBACK_URL}?error=missing_payment`);
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, registration_id, school_id, gateway, gateway_txn_id')
    .eq('id', paymentId).single();

  if (!payment) {
    if (poll) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    return NextResponse.redirect(`${FALLBACK_URL}?error=not_found`);
  }

  // Already paid (webhook beat the redirect)
  if (payment.status === 'paid') {
    if (poll) return NextResponse.json({ status: 'paid', gateway: payment.gateway });
    return NextResponse.redirect(SUCCESS_URL);
  }

  // ── Cashfree GET redirect ──────────────────────────────────────────────────
  if (gw === 'cashfree') {
    try {
      const cfConfig  = await getGatewayConfig(supabase, payment.school_id, 'cashfree');
      const appId     = cfConfig?.config?.key_id     ?? process.env.CASHFREE_APP_ID!;
      const secret    = cfConfig?.config?.key_secret ?? process.env.CASHFREE_SECRET_KEY!;
      const _cfRaw    = cfConfig?.config?.mode       ?? process.env.CASHFREE_MODE ?? 'production';
      const mode      = _cfRaw === 'live' ? 'production' : _cfRaw === 'test' ? 'sandbox' : _cfRaw;

      const result    = await verifyCashfreePayment(payment.gateway_txn_id!, appId, secret, mode as 'production' | 'sandbox');
      const newStatus = result.status === 'PAID' ? 'paid' : 'failed';

      await supabase.from('payments').update({
        status:  newStatus,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', paymentId);

      await supabase.from('registrations').update({ status: newStatus })
        .eq('id', payment.registration_id);

      if (newStatus === 'paid') {
        try { await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }); } catch (_) {}
        await fireSuccessTriggers(payment.registration_id, payment.school_id);
      } else {
        await fireTriggers('payment.failed', payment.registration_id, payment.school_id);
      }

      if (poll) return NextResponse.json({ status: newStatus, gateway: 'cashfree' });
      return NextResponse.redirect(newStatus === 'paid' ? SUCCESS_URL : `${FALLBACK_URL}?payment=failed`);
    } catch (err: any) {
      console.error('[Cashfree verify error]', err.message);
      if (poll) return NextResponse.json({ status: 'error', gateway: 'cashfree' });
      return NextResponse.redirect(`${FALLBACK_URL}?payment=error`);
    }
  }

  // ── Easebuzz GET fallback (normally handled by POST above) ─────────────────
  // Easebuzz calls surl/furl as POST with form body. This GET handler is a
  // safety fallback in case the POST body was not received (e.g. browser redirect).
  // We cannot verify the hash here (no POST body), so we do NOT mark as paid —
  // we redirect to a polling page that waits for the POST to arrive.
  if (gw === 'easebuzz') {
    // If status=success came in URL but POST hasn't updated DB yet,
    // redirect to success page and let frontend poll for final status.
    // If status=failed, mark failed immediately (no hash needed to reject).
    if (status === 'failed') {
      await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentId);
      await supabase.from('registrations').update({ status: 'failed' }).eq('id', payment.registration_id);
      await fireTriggers('payment.failed', payment.registration_id, payment.school_id);
      if (poll) return NextResponse.json({ status: 'failed', gateway: 'easebuzz' });
      return NextResponse.redirect(`${FALLBACK_URL}?payment=failed`);
    }

    // status=success but we need hash from POST body — poll for it
    if (poll) return NextResponse.json({ status: payment.status, gateway: 'easebuzz' });
    // Redirect to success page; it will poll until DB is updated by POST handler
    return NextResponse.redirect(SUCCESS_URL);
  }

  if (poll) return NextResponse.json({ status: payment.status, gateway: payment.gateway });
  return NextResponse.redirect(FALLBACK_URL);
}
