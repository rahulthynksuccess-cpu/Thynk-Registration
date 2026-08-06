import { NextRequest, NextResponse } from 'next/server';
import { fireTriggers } from '@/lib/triggers/fire';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpayWebhook } from '@/lib/payment/razorpay';
import { verifyEasebuzzWebhookHash } from '@/lib/payment/easebuzz';

// Idempotent webhook handler — safe to call multiple times
export async function POST(req: NextRequest) {
  const supabase  = createServiceClient();
  const rawBody   = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const cfSig     = req.headers.get('x-webhook-signature') ?? '';

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // ── Razorpay webhook ──────────────────────────────────────────
  if (signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    if (!verifyRazorpayWebhook(rawBody, signature, secret)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = payload.event as string;
    const entity = payload.payload?.payment?.entity;
    if (!entity) return new Response('ok');

    const orderId    = entity.order_id;
    const paymentId  = entity.id;
    const status     = event === 'payment.captured' ? 'paid' : 'failed';

    // Find payment row by gateway_txn_id (order_id)
    const { data: payment } = await supabase
      .from('payments')
      .select('id, registration_id, school_id, status')
      .eq('gateway_txn_id', orderId)
      .single();

    if (!payment || payment.status === 'paid') return new Response('ok'); // already processed

    await supabase.from('payments').update({
      status,
      gateway_txn_id: paymentId,
      gateway_response: entity,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    }).eq('id', payment.id);

    await supabase.from('registrations').update({ status }).eq('id', payment.registration_id);

    if (status === 'paid') {
      await supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id });
      await fireTriggers('registration.created', payment.registration_id, payment.school_id ?? '');
      await fireTriggers('payment.paid',         payment.registration_id, payment.school_id ?? '');
    } else {
      await fireTriggers('payment.failed', payment.registration_id, payment.school_id ?? '');
    }

    return new Response('ok');
  }

  // ── Cashfree webhook ──────────────────────────────────────────
  if (cfSig) {
    // Cashfree timestamp + signature verification
    const ts     = req.headers.get('x-webhook-timestamp') ?? '';
    const secret = process.env.CASHFREE_WEBHOOK_SECRET!;
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha256', secret).update(`${ts}${rawBody}`).digest('base64');
    if (expected !== cfSig) return new Response('Invalid signature', { status: 401 });

    const { type, data: cfData } = payload;
    if (!cfData?.order) return new Response('ok');

    const cfOrderId = cfData.order.order_id;
    const cfStatus  = type === 'PAYMENT_SUCCESS_WEBHOOK' ? 'paid' : 'failed';

    const { data: payment } = await supabase
      .from('payments')
      .select('id, registration_id, school_id, status')
      .eq('gateway_txn_id', cfOrderId)
      .single();

    if (!payment || payment.status === 'paid') return new Response('ok');

    await supabase.from('payments').update({
      status: cfStatus,
      gateway_response: cfData,
      paid_at: cfStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', payment.id);

    await supabase.from('registrations').update({ status: cfStatus }).eq('id', payment.registration_id);

    if (cfStatus === 'paid') {
      await supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id });
      await fireTriggers('registration.created', payment.registration_id, payment.school_id ?? '');
      await fireTriggers('payment.paid',         payment.registration_id, payment.school_id ?? '');
    } else {
      await fireTriggers('payment.failed', payment.registration_id, payment.school_id ?? '');
    }

    return new Response('ok');
  }

  // ── Easebuzz webhook ──────────────────────────────────────────
  // Easebuzz POSTs form-encoded data to surl/furl.
  // The dedicated /api/payment/easebuzz-callback handles this normally.
  // This handler catches any Easebuzz POSTs routed to /api/payment/webhook
  // (e.g. if webhook URL is set to this endpoint in Easebuzz dashboard).
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => { params[k] = v; });

    const { txnid, status, hash, key } = params;

    // Only handle if it looks like an Easebuzz payload (has txnid + hash + key)
    if (txnid && hash && key) {
      // Find payment by gateway_txn_id (txnid)
      const { data: payment } = await supabase
        .from('payments')
        .select('id, registration_id, school_id, status')
        .eq('gateway_txn_id', txnid)
        .eq('gateway', 'easebuzz')
        .single();

      if (!payment || payment.status === 'paid') return new Response('ok');

      // Load salt for this school
      const { data: schoolCfg } = await supabase
        .from('integration_configs').select('config')
        .eq('school_id', payment.school_id).eq('provider', 'easebuzz').maybeSingle();
      const { data: globalCfg } = !schoolCfg ? await supabase
        .from('integration_configs').select('config')
        .is('school_id', null).eq('provider', 'easebuzz').maybeSingle()
        : { data: null };
      const salt = (schoolCfg?.config?.key_secret ?? globalCfg?.config?.key_secret ?? process.env.EASEBUZZ_SALT ?? '').trim();

      if (salt && !verifyEasebuzzWebhookHash(params, salt)) {
        console.error('[Easebuzz webhook] Hash mismatch for txnid:', txnid);
        return new Response('Invalid hash', { status: 401 });
      }

      const newStatus: 'paid' | 'failed' = (status ?? '').toLowerCase() === 'success' ? 'paid' : 'failed';

      await supabase.from('payments').update({
        status:           newStatus,
        gateway_txn_id:   params.mihpayid || txnid,
        gateway_response: params,
        paid_at:          newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', payment.id);

      await supabase.from('registrations').update({ status: newStatus })
        .eq('id', payment.registration_id);

      if (newStatus === 'paid') {
        try { await supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id }); } catch (_) {}
        await fireTriggers('registration.created', payment.registration_id, payment.school_id ?? '');
        await fireTriggers('payment.paid',         payment.registration_id, payment.school_id ?? '');
      } else {
        await fireTriggers('payment.failed', payment.registration_id, payment.school_id ?? '');
      }

      return new Response('ok');
    }
  }

  // ── PayPal webhook ────────────────────────────────────────────
  // Handles PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.DENIED events.
  // Set webhook URL in PayPal dashboard → https://your-app.vercel.app/api/payment/webhook
  if (payload?.event_type && payload?.resource) {
    const eventType  = payload.event_type as string;
    const resource   = payload.resource;
    const orderId    = resource?.supplementary_data?.related_ids?.order_id
                    ?? resource?.id;  // fallback for some event shapes
    const captureId  = resource?.id;

    if (!orderId && !captureId) return new Response('ok');

    // Find payment by gateway_txn_id (PayPal order ID stored at registration time)
    const { data: payment } = await supabase
      .from('payments')
      .select('id, registration_id, school_id, status')
      .eq('gateway', 'paypal')
      .or(`gateway_txn_id.eq.${orderId},gateway_txn_id.eq.${captureId}`)
      .single();

    if (!payment || payment.status === 'paid') return new Response('ok');

    const newStatus: 'paid' | 'failed' =
      eventType === 'PAYMENT.CAPTURE.COMPLETED' ? 'paid' : 'failed';

    await supabase.from('payments').update({
      status:           newStatus,
      gateway_txn_id:   captureId || orderId,
      gateway_response: resource,
      paid_at:          newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', payment.id);

    await supabase.from('registrations').update({ status: newStatus })
      .eq('id', payment.registration_id);

    if (newStatus === 'paid') {
      try { await supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id }); } catch (_) {}
      await fireTriggers('registration.created', payment.registration_id, payment.school_id ?? '');
      await fireTriggers('payment.paid',         payment.registration_id, payment.school_id ?? '');
    } else {
      await fireTriggers('payment.failed', payment.registration_id, payment.school_id ?? '');
    }

    return new Response('ok');
  }

  return new Response('Unknown webhook source', { status: 400 });
}
