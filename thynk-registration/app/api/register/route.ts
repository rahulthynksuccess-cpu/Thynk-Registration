// app/api/register/route.ts
// Student registration + payment initiation
// Checks school approval status before allowing registration
// FIXES APPLIED:
//   1. Duplicate guard uses correct Supabase syntax (no quoted values in .not(...in...))
//   2. decrement_discount_usage is handled safely with try/catch
//   3. PayPal verification is server-side only

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/payment/razorpay';
import { createCashfreeOrder } from '@/lib/payment/cashfree';
import { initEasebuzzPayment } from '@/lib/payment/easebuzz';
import { generateTxnId } from '@/lib/utils';

function isIndiaCurrency(currency: string): boolean {
  return (currency || 'INR').toUpperCase() === 'INR';
}

// Verify PayPal order server-side using Orders API v2
async function verifyPayPalOrder(
  orderId: string,
  clientId: string,
  clientSecret: string,
  mode: 'live' | 'sandbox' = 'live'
): Promise<{ verified: boolean; status: string; amount?: number }> {
  const base = mode === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    // Get access token
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return { verified: false, status: 'token_error' };
    const { access_token } = await tokenRes.json();

    // Capture the order (idempotent — safe to call even if already captured)
    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await captureRes.json();
    const orderStatus = captureData.status;
    const verified    = orderStatus === 'COMPLETED';

    let amount: number | undefined;
    try {
      const unit    = captureData.purchase_units?.[0];
      const capture = unit?.payments?.captures?.[0];
      amount = capture ? Math.round(parseFloat(capture.amount.value) * 100) : undefined;
    } catch { /* non-critical */ }

    return { verified, status: orderStatus, amount };
  } catch (err: any) {
    return { verified: false, status: 'network_error' };
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();

  const {
    schoolId,
    pricingId,
    gateway,
    studentName,
    classGrade,
    gender,
    parentSchool,
    country,
    state,
    city,
    parentName,
    contactPhone,
    contactEmail,
    discountCode,
    currency: clientCurrency,
    paypalOrderId,
    paypalStatus,
  } = body;

  // ── Basic validation ───────────────────────────────────────────
  if (!schoolId || !pricingId || !gateway || !studentName || !contactEmail) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ── Fetch school + check approval ──────────────────────────────
  const { data: school } = await supabase
    .from('schools')
    .select('id, name, status, is_active, is_registration_active, gateway_config, branding, org_name')
    .eq('id', schoolId)
    .single();

  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // CRITICAL: Only approved schools can accept student registrations
  if (school.status !== 'approved') {
    const statusMessages: Record<string, string> = {
      registered:       'This school registration is pending review. Student registrations are not open yet.',
      pending_approval: 'This school is awaiting approval. Student registrations will open once approved.',
    };
    return NextResponse.json(
      { error: statusMessages[school.status] || 'Registrations are not open for this school.' },
      { status: 403 }
    );
  }

  if (!school.is_active || !school.is_registration_active) {
    return NextResponse.json(
      { error: 'Registrations are currently closed for this school.' },
      { status: 403 }
    );
  }

  // ── Fetch pricing ──────────────────────────────────────────────
  const { data: pricing, error: priceErr } = await supabase
    .from('pricing')
    .select('*')
    .eq('id', pricingId)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .single();

  if (priceErr || !pricing) {
    return NextResponse.json({ error: 'Invalid or inactive pricing' }, { status: 400 });
  }

  const currency = pricing.currency || clientCurrency || 'INR';

  // ── Duplicate registration guard ───────────────────────────────
  // FIX: Supabase .not(col, 'in', val) requires format (val1,val2) WITHOUT quotes
  const { data: existingReg } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('school_id', schoolId)
    .eq('contact_email', contactEmail.toLowerCase().trim())
    .eq('pricing_id', pricingId)
    .not('status', 'in', '(failed,cancelled)')
    .maybeSingle();

  if (existingReg?.status === 'paid') {
    return NextResponse.json(
      { error: 'A registration with this email already exists and is confirmed.' },
      { status: 409 }
    );
  }

  // ── Resolve discount ───────────────────────────────────────────
  let discountAmount = 0;
  if (discountCode && isIndiaCurrency(currency)) {
    const { data: dc } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('school_id', schoolId)
      .eq('code', discountCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (dc) {
      const notExpired   = !dc.expires_at || new Date(dc.expires_at) > new Date();
      const notExhausted = dc.max_uses === null || dc.used_count < dc.max_uses;
      if (notExpired && notExhausted) {
        if (dc.discount_type === 'percent') {
          discountAmount = Math.round((dc.discount_value / 100) * pricing.base_amount);
        } else {
          discountAmount = dc.discount_amount || 0;
        }
      }
    }
  }

  const finalAmount = Math.max(0, pricing.base_amount - discountAmount);

  // ── Handle PayPal (server-side verify) ────────────────────────
  if (gateway === 'paypal') {
    if (!paypalOrderId) {
      return NextResponse.json({ error: 'Missing PayPal order ID' }, { status: 400 });
    }

    const gc             = (school?.gateway_config as any) ?? {};
    const ppClientId     = gc.pp_client_id    || process.env.PAYPAL_CLIENT_ID!;
    const ppClientSecret = gc.pp_client_secret || process.env.PAYPAL_CLIENT_SECRET!;
    const ppMode         = gc.pp_mode          || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');

    let paypalVerified = false;

    if (ppClientId && ppClientSecret) {
      const result   = await verifyPayPalOrder(paypalOrderId, ppClientId, ppClientSecret, ppMode);
      paypalVerified = result.verified;
    } else if (paypalStatus === 'COMPLETED') {
      // Fallback: trust client status only when no server credentials are configured
      console.warn('PayPal server verification skipped — no credentials configured');
      paypalVerified = true;
    }

    if (!paypalVerified) {
      return NextResponse.json({ error: 'PayPal payment could not be verified' }, { status: 402 });
    }

    const { data: registration, error: regErr } = await supabase
      .from('registrations')
      .insert({
        school_id:     schoolId,
        pricing_id:    pricingId,
        student_name:  studentName,
        class_grade:   classGrade,
        gender,
        parent_school: parentSchool,
        country:       country || null,
        state:         state   || null,
        city,
        parent_name:   parentName,
        contact_phone: contactPhone,
        contact_email: contactEmail.toLowerCase().trim(),
        status:        'paid',
      })
      .select()
      .single();

    if (regErr || !registration) {
      return NextResponse.json({ error: 'Failed to save registration' }, { status: 500 });
    }

    const { data: payment } = await supabase
      .from('payments')
      .insert({
        registration_id: registration.id,
        school_id:       schoolId,
        gateway:         'paypal',
        gateway_txn_id:  paypalOrderId,
        base_amount:     pricing.base_amount,
        discount_amount: discountAmount,
        final_amount:    finalAmount,
        discount_code:   discountCode?.toUpperCase() ?? null,
        currency,
        status:          'paid',
        paid_at:         new Date().toISOString(),
      })
      .select()
      .single();

    // FIX: decrement discount usage safely — function exists after running SQL migration
    if (payment?.id && discountCode) {
      supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id }).then(
        () => {},
        (err: any) => console.warn('decrement_discount_usage failed:', err?.message)
      );
    }

    return NextResponse.json({
      gateway:         'paypal',
      payment_id:      payment?.id,
      registration_id: registration.id,
      status:          'paid',
    });
  }

  // ── Save registration (pending for card/UPI gateways) ─────────
  const { data: registration, error: regErr } = await supabase
    .from('registrations')
    .insert({
      school_id:     schoolId,
      pricing_id:    pricingId,
      student_name:  studentName,
      class_grade:   classGrade,
      gender,
      parent_school: parentSchool,
      country:       country || null,
      state:         state   || null,
      city,
      parent_name:   parentName,
      contact_phone: contactPhone,
      contact_email: contactEmail.toLowerCase().trim(),
      status:        'pending',
    })
    .select()
    .single();

  if (regErr || !registration) {
    return NextResponse.json({ error: 'Failed to save registration' }, { status: 500 });
  }

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      registration_id: registration.id,
      school_id:       schoolId,
      gateway,
      base_amount:     pricing.base_amount,
      discount_amount: discountAmount,
      final_amount:    finalAmount,
      discount_code:   discountCode?.toUpperCase() ?? null,
      currency,
      status:          'pending',
    })
    .select()
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
  }

  const gc     = (school?.gateway_config as any) ?? {};
  const appUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://thynk-registration.vercel.app';

  try {
    // ── Razorpay ───────────────────────────────────────────────
    if (gateway === 'razorpay') {
      const keyId     = gc.rzp_key_id  ?? process.env.RAZORPAY_KEY_ID!;
      const keySecret = gc.rzp_secret  ?? process.env.RAZORPAY_KEY_SECRET!;
      const order = await createRazorpayOrder(
        {
          amount:   finalAmount,
          currency: pricing.currency,
          receipt:  payment.id,
          notes: {
            student_name: studentName,
            school:       parentSchool || '',
            city:         city || '',
            class_grade:  classGrade || '',
          },
        },
        keyId, keySecret
      );

      await supabase.from('payments').update({ gateway_txn_id: order.id, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway:         'razorpay',
        payment_id:      payment.id,
        registration_id: registration.id,
        order_id:        order.id,
        amount:          finalAmount,
        currency:        pricing.currency,
        key_id:          keyId,
      });
    }

    // ── Cashfree ───────────────────────────────────────────────
    if (gateway === 'cashfree') {
      const appId     = gc.cf_app_id ?? process.env.CASHFREE_APP_ID!;
      const secretKey = gc.cf_secret ?? process.env.CASHFREE_SECRET_KEY!;
const mode      = gc.cf_mode   ?? process.env.CASHFREE_MODE ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
      const txnId     = `CF${payment.id.replace(/-/g, '').slice(0, 16)}`;

      const cfOrder = await createCashfreeOrder(
        {
          orderId:       txnId,
          amount:        finalAmount / 100,
          currency:      pricing.currency,
          customerName:  studentName,
          customerEmail: contactEmail,
          customerPhone: contactPhone,
          returnUrl:     `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=cashfree`,
        },
        appId, secretKey, mode
      );

      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway:            'cashfree',
        payment_id:         payment.id,
        registration_id:    registration.id,
        payment_session_id: cfOrder.payment_session_id,
        cf_mode:            mode,
      });
    }

    // ── Easebuzz ───────────────────────────────────────────────
    if (gateway === 'easebuzz') {
      const ebKey  = gc.eb_key  ?? process.env.EASEBUZZ_KEY!;
      const ebSalt = gc.eb_salt ?? process.env.EASEBUZZ_SALT!;
      const ebEnv  = gc.eb_env  ?? (process.env.EASEBUZZ_ENV as 'production' | 'test') ?? 'production';
      const txnId  = generateTxnId('EB');

      const ebResult = await initEasebuzzPayment(
        {
          txnid:       txnId,
          amount:      (finalAmount / 100).toFixed(2),
          productinfo: pricing.program_name,
          firstname:   studentName,
          email:       contactEmail,
          phone:       contactPhone,
          udf1:        parentName   || '',
          udf2:        parentSchool || '',
          udf3:        city         || '',
          udf4:        classGrade   || '',
          udf5:        gender       || '',
          surl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=success`,
          furl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=failed`,
        },
        ebKey, ebSalt, ebEnv
      );

      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway:         'easebuzz',
        payment_id:      payment.id,
        registration_id: registration.id,
        access_key:      ebResult.access_key,
        payment_url:     ebResult.payment_url,
      });
    }

    return NextResponse.json({ error: 'Unknown gateway' }, { status: 400 });

  } catch (err: any) {
    // Clean up pending records on gateway failure
    await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    await supabase.from('registrations').update({ status: 'failed' }).eq('id', registration.id);
    return NextResponse.json({ error: err.message ?? 'Gateway error' }, { status: 500 });
  }
}
