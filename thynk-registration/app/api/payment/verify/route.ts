import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpaySignature } from '@/lib/payment/razorpay';
import { verifyCashfreePayment } from '@/lib/payment/cashfree';

const SUCCESS_URL = 'https://www.thynksuccess.com/registration/success';
const FALLBACK_URL = 'https://www.thynksuccess.com';

// Helper — builds the registration form URL for failed/error redirects
function registrationUrl(schoolCode: string, projectSlug: string) {
  const frontend = process.env.NEXT_PUBLIC_FRONTEND_URL ?? FALLBACK_URL;
  return `${frontend}/registration/${projectSlug}/${schoolCode}`;
}

// POST — called by client after Razorpay success callback
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();
  const { paymentId, gateway, gatewayTxnId, razorpayOrderId, razorpaySignature } = body;

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(*), schools(gateway_config)')
    .eq('id', paymentId)
    .single();

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  const gc = (payment.schools as any)?.gateway_config ?? {};

  let verified = false;
  let newStatus: 'paid' | 'failed' = 'failed';
  let txnId = gatewayTxnId ?? payment.gateway_txn_id;

  if (gateway === 'razorpay' && razorpayOrderId && razorpaySignature && gatewayTxnId) {
    const secret = gc.rzp_secret ?? process.env.RAZORPAY_KEY_SECRET!;
    verified = verifyRazorpaySignature(razorpayOrderId, gatewayTxnId, razorpaySignature, secret);
    newStatus = verified ? 'paid' : 'failed';
    txnId = gatewayTxnId;
  }

  await supabase.from('payments').update({
    status: newStatus,
    gateway_txn_id: txnId,
    paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', paymentId);

  await supabase.from('registrations').update({
    status: newStatus,
  }).eq('id', payment.registration_id);

  if (newStatus === 'paid') {
    await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });
  }

  return NextResponse.json({ success: true, status: newStatus });
}

// GET — redirect return URL used by Cashfree / Easebuzz after payment
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');
  const gw        = searchParams.get('gw');
  const status    = searchParams.get('status');

  if (!paymentId) return NextResponse.redirect(`${FALLBACK_URL}?error=missing_payment`);

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(school_id, schools(school_code, project_slug)), schools(gateway_config)')
    .eq('id', paymentId)
    .single();

  if (!payment) return NextResponse.redirect(`${FALLBACK_URL}?error=not_found`);

  const schoolCode  = (payment.registrations as any)?.schools?.school_code ?? '';
  const projectSlug = (payment.registrations as any)?.schools?.project_slug ?? '';
  const gc          = (payment.schools as any)?.gateway_config ?? {};
  const base        = registrationUrl(schoolCode, projectSlug);

  if (gw === 'cashfree') {
    try {
      const appId  = gc.cf_app_id ?? process.env.CASHFREE_APP_ID!;
      const secret = gc.cf_secret ?? process.env.CASHFREE_SECRET_KEY!;
      const mode   = gc.cf_mode   ?? process.env.CASHFREE_MODE ?? 'production';
      const result = await verifyCashfreePayment(payment.gateway_txn_id!, appId, secret, mode as 'production' | 'sandbox');
      const newStatus = result.status === 'PAID' ? 'paid' : 'failed';

      await supabase.from('payments').update({ status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null }).eq('id', paymentId);
      await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);
      if (newStatus === 'paid') await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });

      const dest = newStatus === 'paid'
        ? SUCCESS_URL
        : `${base}?payment=failed`;
      return NextResponse.redirect(dest);
    } catch {
      return NextResponse.redirect(`${base}?payment=error`);
    }
  }

  if (gw === 'easebuzz') {
    const newStatus = status === 'success' ? 'paid' : 'failed';
    await supabase.from('payments').update({ status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null }).eq('id', paymentId);
    await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);
    if (newStatus === 'paid') await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });

    const dest = newStatus === 'paid'
      ? SUCCESS_URL
      : `${base}?payment=failed`;
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(base);
}
