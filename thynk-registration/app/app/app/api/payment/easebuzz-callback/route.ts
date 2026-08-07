export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — allow SMTP + WhatsApp API calls to complete
/**
 * /api/payment/easebuzz-callback
 *
 * Dedicated POST handler for Easebuzz surl/furl callbacks.
 * Easebuzz POSTs application/x-www-form-urlencoded form data here
 * after payment success OR failure.
 *
 * Both surl and furl point here — status is determined from the posted `status` field.
 *
 * IMPORTANT: payment.failed trigger is NOT fired on hash mismatch or
 * technical errors — only on genuine payment failures from Easebuzz.
 * This prevents spurious email/WhatsApp on WC0E03 and retries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyEasebuzzWebhookHash } from '@/lib/payment/easebuzz';
import { fireTriggers } from '@/lib/triggers/fire';

const SUCCESS_URL  = 'https://www.thynksuccess.com/registration/success';
const FALLBACK_URL = 'https://www.thynksuccess.com';

async function getEasebuzzSalt(supabase: any, schoolId: string): Promise<string> {
  // Try school-specific first, then global
  const { data: schoolCfg } = await supabase
    .from('integration_configs').select('config')
    .eq('school_id', schoolId).eq('provider', 'easebuzz').maybeSingle();
  if (schoolCfg?.config?.key_secret) return schoolCfg.config.key_secret.trim();

  const { data: globalCfg } = await supabase
    .from('integration_configs').select('config')
    .is('school_id', null).eq('provider', 'easebuzz').maybeSingle();
  return (globalCfg?.config?.key_secret ?? process.env.EASEBUZZ_SALT ?? '').trim();
}

/**
 * GET handler — Easebuzz JS SDK sometimes redirects the browser to surl as a GET
 * (in addition to the server-to-server POST). We look up the payment status in DB
 * (the POST should have already updated it) and redirect accordingly.
 * If the POST hasn't arrived yet we redirect to SUCCESS_URL and let the frontend poll.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');

  if (!paymentId) {
    console.error('[easebuzz-callback GET] Missing paymentId');
    return NextResponse.redirect(`${FALLBACK_URL}?payment=error`, 303);
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, registration_id, school_id')
    .eq('id', paymentId)
    .single();

  if (!payment) {
    console.error('[easebuzz-callback GET] Payment not found:', paymentId);
    return NextResponse.redirect(`${FALLBACK_URL}?payment=error`, 303);
  }

  console.log('[easebuzz-callback GET] paymentId=%s status=%s', paymentId, payment.status);

  if (payment.status === 'paid') {
    return NextResponse.redirect(SUCCESS_URL, 303);
  }

  if (payment.status === 'failed') {
    return NextResponse.redirect(`${FALLBACK_URL}?payment=failed`, 303);
  }

  // Status still pending/initiated — POST may not have arrived yet.
  // Redirect to success page; it will show a confirmation once the POST updates the DB.
  return NextResponse.redirect(SUCCESS_URL, 303);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');

  if (!paymentId) {
    console.error('[easebuzz-callback] Missing paymentId in URL');
    return NextResponse.redirect(`${FALLBACK_URL}?payment=error`, 303);
  }

  const supabase = createServiceClient();

  // Fetch payment record
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, registration_id, school_id, gateway_txn_id')
    .eq('id', paymentId)
    .single();

  if (!payment) {
    console.error('[easebuzz-callback] Payment not found:', paymentId);
    return NextResponse.redirect(`${FALLBACK_URL}?payment=error`, 303);
  }

  // Already processed — redirect without double-firing triggers
  if (payment.status === 'paid') {
    console.log('[easebuzz-callback] Already paid, skipping:', paymentId);
    return NextResponse.redirect(SUCCESS_URL, 303);
  }

  // Parse POST body
  let params: Record<string, string> = {};
  try {
    const raw = await req.text();
    new URLSearchParams(raw).forEach((v, k) => { params[k] = v; });
  } catch (e) {
    console.error('[easebuzz-callback] Failed to parse body:', e);
    return NextResponse.redirect(`${FALLBACK_URL}?payment=error`, 303);
  }

  const { txnid, status, hash } = params;
  console.log('[easebuzz-callback] paymentId=%s txnid=%s status=%s', paymentId, txnid, status);

  // ── Hash verification ─────────────────────────────────────────────────────
  // IMPORTANT: On hash mismatch we do NOT fire payment.failed trigger.
  // Hash mismatch = tampered/invalid request, not a genuine payment failure.
  // Firing payment.failed on hash mismatch was causing emails/WhatsApp to
  // send even for WC0E03 errors and retried payments.
  const salt = await getEasebuzzSalt(supabase, payment.school_id);
  if (salt && hash) {
    const valid = verifyEasebuzzWebhookHash(params, salt);
    if (!valid) {
      console.error('[easebuzz-callback] Hash mismatch — rejecting paymentId:', paymentId, 'txnid:', txnid);
      // Mark as failed in DB (for audit) but do NOT fire any notification triggers.
      // The student will see the generic error page and can retry.
      await supabase.from('payments').update({
        status: 'failed',
        gateway_response: { ...params, _reject_reason: 'hash_mismatch' },
      }).eq('id', paymentId);
      await supabase.from('registrations').update({ status: 'failed' }).eq('id', payment.registration_id);
      return NextResponse.redirect(`${FALLBACK_URL}?payment=failed`, 303);
    }
  } else if (!salt) {
    console.warn('[easebuzz-callback] No Easebuzz salt configured — skipping hash verification for paymentId:', paymentId);
  }

  // ── Determine outcome ─────────────────────────────────────────────────────
  // Easebuzz sends status='success' for paid, 'failure' or 'userCancelled' for anything else.
  const easebuzzStatus = (status ?? '').toLowerCase();
  const newStatus: 'paid' | 'failed' = easebuzzStatus === 'success' ? 'paid' : 'failed';

  // ── Update payment ────────────────────────────────────────────────────────
  await supabase.from('payments').update({
    status:           newStatus,
    gateway_txn_id:   params.mihpayid || txnid || payment.gateway_txn_id || null,
    gateway_response: params,
    paid_at:          newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', paymentId);

  // ── Update registration ───────────────────────────────────────────────────
  await supabase.from('registrations').update({ status: newStatus })
    .eq('id', payment.registration_id);

  if (newStatus === 'paid') {
    // Decrement discount usage if applicable
    try { await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }); } catch (_) {}

    // Fire both triggers: registration confirmation + payment confirmation
    await fireTriggers('registration.created', payment.registration_id, payment.school_id);
    await fireTriggers('payment.paid',         payment.registration_id, payment.school_id);

    console.log('[easebuzz-callback] ✅ Payment confirmed:', paymentId, 'txnid:', txnid);
    return NextResponse.redirect(SUCCESS_URL, 303);

  } else {
    // Only fire payment.failed for genuine Easebuzz failures (status != success),
    // NOT for hash mismatches (handled above) or other technical errors.
    // This prevents duplicate/spurious email+WhatsApp notifications.
    await fireTriggers('payment.failed', payment.registration_id, payment.school_id);

    console.log('[easebuzz-callback] ❌ Payment failed:', paymentId, 'easebuzz status:', easebuzzStatus);
    return NextResponse.redirect(`${FALLBACK_URL}?payment=failed`, 303);
  }
}
