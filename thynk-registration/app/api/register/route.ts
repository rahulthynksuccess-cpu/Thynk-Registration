import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveGateways, getRazorpayCredentials, getCashfreeCredentials, getEasebuzzCredentials } from '@/lib/payment/router';
import { createRazorpayOrder } from '@/lib/payment/razorpay';
import { createCashfreeOrder } from '@/lib/payment/cashfree';
import { initEasebuzzPayment } from '@/lib/payment/easebuzz';
import { generateTxnId } from '@/lib/utils';
import { fireTriggers } from '@/lib/triggers/fire';

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();

  const {
    schoolId, pricingId, gateway,
    studentName, classGrade, gender, parentSchool,
    city, parentName, contactPhone, contactEmail,
    discountCode, paypalOrderId, paypalStatus,
  } = body;

  if (!schoolId || !pricingId || !studentName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Fetch pricing
  const { data: pricing, error: priceErr } = await supabase
    .from('pricing')
    .select('*')
    .eq('id', pricingId)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .single();

  if (priceErr || !pricing) {
    return NextResponse.json({ error: 'Invalid pricing' }, { status: 400 });
  }

  // Resolve discount (supports fixed + percent)
  let discountAmount = 0;
  if (discountCode) {
    const { data: dc } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('school_id', schoolId)
      .eq('code', discountCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (dc && (dc.max_uses === null || dc.used_count < dc.max_uses)) {
      const now = new Date().toISOString();
      if (!dc.expires_at || dc.expires_at > now) {
        if (dc.discount_type === 'percent' && dc.discount_value) {
          discountAmount = Math.round(pricing.base_amount * dc.discount_value / 100);
        } else {
          discountAmount = dc.discount_amount;
        }
      }
    }
  }

  const finalAmount = Math.max(pricing.base_amount - discountAmount, 0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  // ── PayPal: registration saved after payment capture ────────────
  if (gateway === 'paypal' && paypalOrderId) {
    const { data: registration } = await supabase.from('registrations').insert({
      school_id: schoolId, pricing_id: pricingId,
      student_name: studentName, class_grade: classGrade,
      gender, parent_school: parentSchool, city,
      parent_name: parentName, contact_phone: contactPhone,
      contact_email: contactEmail, status: 'paid',
    }).select().single();

    if (registration) {
      await supabase.from('payments').insert({
        registration_id: registration.id, school_id: schoolId,
        gateway: 'paypal', gateway_txn_id: paypalOrderId,
        base_amount: pricing.base_amount, discount_amount: discountAmount,
        final_amount: finalAmount, discount_code: discountCode?.toUpperCase() ?? null,
        status: paypalStatus === 'COMPLETED' ? 'paid' : 'initiated',
        paid_at: paypalStatus === 'COMPLETED' ? new Date().toISOString() : null,
      });

      // Fire triggers asynchronously — don't block response
      fireTriggers('registration_created', registration.id, schoolId).catch(console.error);
      if (paypalStatus === 'COMPLETED') {
        fireTriggers('payment_success', registration.id, schoolId).catch(console.error);
      }
    }
    return NextResponse.json({ success: true });
  }

  // ── Save registration (pending) ─────────────────────────────────
  const { data: registration, error: regErr } = await supabase
    .from('registrations')
    .insert({
      school_id: schoolId, pricing_id: pricingId,
      student_name: studentName, class_grade: classGrade,
      gender, parent_school: parentSchool, city,
      parent_name: parentName, contact_phone: contactPhone,
      contact_email: contactEmail, status: 'pending',
    })
    .select()
    .single();

  if (regErr || !registration) {
    return NextResponse.json({ error: 'Failed to save registration' }, { status: 500 });
  }

  // Fire registration_created trigger
  fireTriggers('registration_created', registration.id, schoolId).catch(console.error);

  // ── Save payment record (pending) ───────────────────────────────
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      registration_id: registration.id, school_id: schoolId,
      gateway, base_amount: pricing.base_amount,
      discount_amount: discountAmount, final_amount: finalAmount,
      discount_code: discountCode?.toUpperCase() ?? null, status: 'pending',
    })
    .select()
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
  }

  // ── Resolve gateway config from integration_configs ─────────────
  const currency = pricing.currency ?? 'INR';
  let gatewayConfig: Record<string, any> = {};
  try {
    const gateways = await resolveGateways(schoolId, currency);
    const match = gateways.find(g => g.provider === gateway);
    if (match) gatewayConfig = match.config;
  } catch { /* use empty config — will fall back to env vars */ }

  try {
    // ── Razorpay ──────────────────────────────────────────────────
    if (gateway === 'razorpay') {
      const { keyId, keySecret } = getRazorpayCredentials(gatewayConfig);
      const order = await createRazorpayOrder(
        { amount: finalAmount, currency, receipt: payment.id,
          notes: { student_name: studentName, school: parentSchool, city, class_grade: classGrade } },
        keyId, keySecret
      );
      await supabase.from('payments').update({ gateway_txn_id: order.id, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);
      return NextResponse.json({
        gateway: 'razorpay', payment_id: payment.id, registration_id: registration.id,
        order_id: order.id, amount: finalAmount, currency, key_id: keyId,
      });
    }

    // ── Cashfree ──────────────────────────────────────────────────
    if (gateway === 'cashfree') {
      const { appId, secretKey, mode } = getCashfreeCredentials(gatewayConfig);
      const txnId = `CF${payment.id.replace(/-/g,'').slice(0,16)}`;
      const cfOrder = await createCashfreeOrder(
        { orderId: txnId, amount: finalAmount / 100, currency,
          customerName: studentName, customerEmail: contactEmail, customerPhone: contactPhone,
          returnUrl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=cashfree` },
        appId, secretKey, mode
      );
      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);
      return NextResponse.json({
        gateway: 'cashfree', payment_id: payment.id, registration_id: registration.id,
        payment_session_id: cfOrder.payment_session_id, cf_mode: mode,
      });
    }

    // ── Easebuzz ──────────────────────────────────────────────────
    if (gateway === 'easebuzz') {
      const { key, salt, env } = getEasebuzzCredentials(gatewayConfig);
      const txnId = generateTxnId('EB');
      const ebResult = await initEasebuzzPayment(
        { txnid: txnId, amount: (finalAmount / 100).toFixed(2),
          productinfo: pricing.program_name, firstname: studentName,
          email: contactEmail, phone: contactPhone,
          udf1: parentName, udf2: parentSchool, udf3: city, udf4: classGrade, udf5: gender,
          surl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=success`,
          furl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=failed` },
        key, salt, env
      );
      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);
      return NextResponse.json({
        gateway: 'easebuzz', payment_id: payment.id, registration_id: registration.id,
        access_key: ebResult.access_key, payment_url: ebResult.payment_url,
      });
    }

    return NextResponse.json({ error: 'Unknown gateway' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Gateway error' }, { status: 500 });
  }
}
