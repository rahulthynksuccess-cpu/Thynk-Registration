import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpaySignature } from '@/lib/payment/razorpay';
import { verifyCashfreePayment } from '@/lib/payment/cashfree';
import { getCashfreeCredentials } from '@/lib/payment/router';
import { fireTriggers } from '@/lib/triggers/fire';

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();
  const { paymentId, gateway, gatewayTxnId, razorpayOrderId, razorpaySignature } = body;

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(*)')
    .eq('id', paymentId)
    .single();

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  // Load gateway config from integration_configs
  let gatewayConfig: Record<string, any> = {};
  const { data: cfgs } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('school_id', payment.school_id)
    .eq('provider', gateway ?? payment.gateway)
    .eq('is_active', true)
    .limit(1);
  if (cfgs?.[0]) gatewayConfig = cfgs[0].config;

  let verified = false;
  let newStatus: 'paid' | 'failed' = 'failed';
  let txnId = gatewayTxnId ?? payment.gateway_txn_id;

  if (gateway === 'razorpay' && razorpayOrderId && razorpaySignature && gatewayTxnId) {
    const secret = gatewayConfig.rzp_key_secret ?? process.env.RAZORPAY_KEY_SECRET!;
    verified  = verifyRazorpaySignature(razorpayOrderId, gatewayTxnId, razorpaySignature, secret);
    newStatus = verified ? 'paid' : 'failed';
    txnId     = gatewayTxnId;
  }

  await supabase.from('payments').update({
    status: newStatus,
    gateway_txn_id: txnId,
    paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', paymentId);

  await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);

  if (newStatus === 'paid') {
    await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });
    fireTriggers('payment_success', payment.registration_id, payment.school_id).catch(console.error);
  } else {
    fireTriggers('payment_failed', payment.registration_id, payment.school_id).catch(console.error);
  }

  return NextResponse.json({ success: true, status: newStatus });
}

// GET — redirect return URL used by Cashfree / Easebuzz
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');
  const gw        = searchParams.get('gw');
  const status    = searchParams.get('status');
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL!;

  if (!paymentId) return NextResponse.redirect(`${appUrl}?error=missing_payment`);

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('*, registrations(school_id, schools(school_code))')
    .eq('id', paymentId)
    .single();

  if (!payment) return NextResponse.redirect(`${appUrl}?error=not_found`);

  const schoolCode = (payment.registrations as any)?.schools?.school_code ?? '';

  // Load gateway config
  let gatewayConfig: Record<string, any> = {};
  const { data: cfgs } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('school_id', payment.school_id)
    .eq('provider', gw ?? payment.gateway)
    .eq('is_active', true)
    .limit(1);
  if (cfgs?.[0]) gatewayConfig = cfgs[0].config;

  if (gw === 'cashfree') {
    try {
      const { appId, secretKey, mode } = getCashfreeCredentials(gatewayConfig);
      const result = await verifyCashfreePayment(payment.gateway_txn_id!, appId, secretKey, mode);
      const newStatus = result.status === 'PAID' ? 'paid' : 'failed';
      await supabase.from('payments').update({ status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null }).eq('id', paymentId);
      await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);
      if (newStatus === 'paid') {
        await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });
        fireTriggers('payment_success', payment.registration_id, payment.school_id).catch(console.error);
      } else {
        fireTriggers('payment_failed', payment.registration_id, payment.school_id).catch(console.error);
      }
      const dest = newStatus === 'paid'
        ? `${appUrl}/${schoolCode}/success?paymentId=${paymentId}`
        : `${appUrl}/${schoolCode}?payment=failed`;
      return NextResponse.redirect(dest);
    } catch {
      return NextResponse.redirect(`${appUrl}/${schoolCode}?payment=error`);
    }
  }

  if (gw === 'easebuzz') {
    const newStatus = status === 'success' ? 'paid' : 'failed';
    await supabase.from('payments').update({ status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null }).eq('id', paymentId);
    await supabase.from('registrations').update({ status: newStatus }).eq('id', payment.registration_id);
    if (newStatus === 'paid') {
      await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId });
      fireTriggers('payment_success', payment.registration_id, payment.school_id).catch(console.error);
    } else {
      fireTriggers('payment_failed', payment.registration_id, payment.school_id).catch(console.error);
    }
    const dest = newStatus === 'paid'
      ? `${appUrl}/${schoolCode}/success?paymentId=${paymentId}`
      : `${appUrl}/${schoolCode}?payment=failed`;
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(`${appUrl}/${schoolCode}`);
}
