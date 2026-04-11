import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpayWebhook } from '@/lib/payment/razorpay';

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
      .select('id, registration_id, status')
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
      .select('id, registration_id, status')
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
    }

    return new Response('ok');
  }

  return new Response('Unknown webhook source', { status: 400 });
}
