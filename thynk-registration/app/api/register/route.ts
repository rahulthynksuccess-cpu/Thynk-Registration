import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/payment/razorpay';
import { createCashfreeOrder } from '@/lib/payment/cashfree';
import { initEasebuzzPayment } from '@/lib/payment/easebuzz';
import { generateTxnId } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json();

  const {
    schoolId, pricingId, gateway,
    studentName, classGrade, gender, parentSchool,
    city, parentName, contactPhone, contactEmail,
    discountCode,
  } = body;

  if (!schoolId || !pricingId || !gateway || !studentName) {
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

  // Fetch school gateway config
  const { data: school } = await supabase
    .from('schools')
    .select('gateway_config, org_name, branding, is_registration_active')
    .eq('id', schoolId)
    .single();

  // Block if registration is not active for this school
  if (school?.is_registration_active === false) {
    return NextResponse.json({ error: 'Registrations are currently closed for this school.' }, { status: 403 });
  }

  // Resolve discount
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
      discountAmount = dc.discount_amount;
    }
  }

  const finalAmount = pricing.base_amount - discountAmount; // in paise

  // Save registration
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

  // Save payment record as pending
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      registration_id: registration.id,
      school_id: schoolId,
      gateway,
      base_amount: pricing.base_amount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      discount_code: discountCode?.toUpperCase() ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (payErr || !payment) {
    return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
  }

  const gc = (school?.gateway_config as any) ?? {};
  // Payment gateway callbacks must point to the backend (Vercel), not the frontend
  const appUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://thynk-registration.vercel.app';

  try {
    // ── Razorpay ──────────────────────────────────────────────────
    if (gateway === 'razorpay') {
      const keyId     = gc.rzp_key_id  ?? process.env.RAZORPAY_KEY_ID!;
      const keySecret = gc.rzp_secret  ?? process.env.RAZORPAY_KEY_SECRET!;
      const order = await createRazorpayOrder(
        {
          amount: finalAmount,
          currency: pricing.currency,
          receipt: payment.id,
          notes: { student_name: studentName, school: parentSchool, city, class_grade: classGrade },
        },
        keyId, keySecret
      );

      await supabase.from('payments').update({ gateway_txn_id: order.id, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway: 'razorpay',
        payment_id: payment.id,
        registration_id: registration.id,
        order_id: order.id,
        amount: finalAmount,
        currency: pricing.currency,
        key_id: keyId,
      });
    }

    // ── Cashfree ──────────────────────────────────────────────────
    if (gateway === 'cashfree') {
      const appId     = gc.cf_app_id  ?? process.env.CASHFREE_APP_ID!;
      const secretKey = gc.cf_secret  ?? process.env.CASHFREE_SECRET_KEY!;
      const mode      = gc.cf_mode    ?? (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
      const txnId     = `CF${payment.id.replace(/-/g,'').slice(0,16)}`;

      const cfOrder = await createCashfreeOrder(
        {
          orderId: txnId,
          amount: finalAmount / 100,  // Cashfree uses rupees
          currency: pricing.currency,
          customerName: studentName,
          customerEmail: contactEmail,
          customerPhone: contactPhone,
          returnUrl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=cashfree`,
        },
        appId, secretKey, mode
      );

      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway: 'cashfree',
        payment_id: payment.id,
        registration_id: registration.id,
        payment_session_id: cfOrder.payment_session_id,
        cf_mode: mode,
      });
    }

    // ── Easebuzz ──────────────────────────────────────────────────
    if (gateway === 'easebuzz') {
      const ebKey  = gc.eb_key  ?? process.env.EASEBUZZ_KEY!;
      const ebSalt = gc.eb_salt ?? process.env.EASEBUZZ_SALT!;
      const ebEnv  = gc.eb_env  ?? (process.env.EASEBUZZ_ENV as 'production' | 'test') ?? 'production';
      const txnId  = generateTxnId('EB');

      const ebResult = await initEasebuzzPayment(
        {
          txnid: txnId,
          amount: (finalAmount / 100).toFixed(2),
          productinfo: pricing.program_name,
          firstname: studentName,
          email: contactEmail,
          phone: contactPhone,
          udf1: parentName,
          udf2: parentSchool,
          udf3: city,
          udf4: classGrade,
          udf5: gender,
          surl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=success`,
          furl: `${appUrl}/api/payment/verify?paymentId=${payment.id}&gw=easebuzz&status=failed`,
        },
        ebKey, ebSalt, ebEnv
      );

      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway: 'easebuzz',
        payment_id: payment.id,
        registration_id: registration.id,
        access_key: ebResult.access_key,
        payment_url: ebResult.payment_url,
      });
    }

    return NextResponse.json({ error: 'Unknown gateway' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Gateway error' }, { status: 500 });
  }
}
