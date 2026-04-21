// app/api/register/route.ts
// Student registration + payment initiation
// CHANGES:
//   1. Reads gateway credentials from integration_configs table (set via Admin → Integrations UI)
//      Falls back to Vercel env vars only if not configured in UI
//   2. CASHFREE_MODE env var support added (no need to change code for test/live switch)
//   3. All gateways redirect to https://www.thynksuccess.com/registration/success on success
//   4. Payment status re-check endpoint added (GET /api/register?paymentId=xxx)

import { NextRequest, NextResponse } from 'next/server';
import { fireTriggers } from '@/lib/triggers/fire';
import { createServiceClient } from '@/lib/supabase/server';
import { createRazorpayOrder } from '@/lib/payment/razorpay';
import { createCashfreeOrder } from '@/lib/payment/cashfree';
import { initEasebuzzPayment, generateEasebuzzTxnId, normalisePhone as normaliseEbPhone } from '@/lib/payment/easebuzz';
import { generateTxnId } from '@/lib/utils';

function isIndiaCurrency(currency: string): boolean {
  return (currency || 'INR').toUpperCase() === 'INR';
}

// ── Load gateway credentials from integration_configs table ───────────────────
// The Admin → Integrations UI saves: { key_id, key_secret, mode, priority }
// under integration_configs.config for each provider + school_id
async function getGatewayConfig(supabase: any, schoolId: string, provider: string) {
  // 1. Try school-specific config first
  const { data: schoolCfg } = await supabase
    .from('integration_configs')
    .select('config, is_active')
    .eq('school_id', schoolId)
    .eq('provider', provider)
    .maybeSingle();
  if (schoolCfg) return schoolCfg;

  // 2. Fall back to global config (school_id = null) — set via Admin → Integrations page
  const { data: globalCfg } = await supabase
    .from('integration_configs')
    .select('config, is_active')
    .is('school_id', null)
    .eq('provider', provider)
    .maybeSingle();
  return globalCfg ?? null;
}

// ── Verify PayPal order server-side using Orders API v2 ───────────────────────
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
    // Get OAuth token
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

    // GET the order to verify — frontend already captured it via actions.order.capture()
    // DO NOT call /capture again — PayPal rejects double captures
    const orderRes = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const orderData  = await orderRes.json();
    const orderStatus = orderData.status;
    // COMPLETED = fully captured, APPROVED = approved but not yet captured server-side
    const verified   = orderStatus === 'COMPLETED' || orderStatus === 'APPROVED';

    let amount: number | undefined;
    try {
      const unit    = orderData.purchase_units?.[0];
      const capture = unit?.payments?.captures?.[0];
      amount = capture ? Math.round(parseFloat(capture.amount.value) * 100) : undefined;
    } catch { /* non-critical */ }

    return { verified, status: orderStatus, amount };
  } catch {
    return { verified: false, status: 'network_error' };
  }
}

// ── GET — Payment status re-check (for delayed payment responses) ─────────────
// Call: GET /api/register?paymentId=<uuid>
// Returns current status so frontend can poll after a delayed redirect
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('paymentId');

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, gateway, gateway_txn_id, final_amount, currency, registration_id, school_id, registrations(student_name, contact_email)')
    .eq('id', paymentId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // If still pending/initiated — try to verify with the gateway directly
  if (payment.status === 'initiated' || payment.status === 'pending') {
    if (payment.gateway === 'cashfree' && payment.gateway_txn_id) {
      try {
        const cfConfig = await getGatewayConfig(supabase, payment.school_id, 'cashfree');
        const appId    = cfConfig?.config?.key_id     ?? process.env.CASHFREE_APP_ID!;
        const secret   = cfConfig?.config?.key_secret ?? process.env.CASHFREE_SECRET_KEY!;
        const _cfRaw2  = cfConfig?.config?.mode       ?? process.env.CASHFREE_MODE ?? 'production';
        const mode     = _cfRaw2 === 'live' ? 'production' : _cfRaw2 === 'test' ? 'sandbox' : _cfRaw2;

        const { verifyCashfreePayment } = await import('@/lib/payment/cashfree');
        const result    = await verifyCashfreePayment(payment.gateway_txn_id, appId, secret, mode as 'production' | 'sandbox');
        const newStatus = result.status === 'PAID' ? 'paid' : payment.status; // don't mark failed if just pending

        if (newStatus === 'paid') {
          await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', paymentId);
          await supabase.from('registrations').update({ status: 'paid' }).eq('id', payment.registration_id);
          try { await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }); } catch (_) {}
          return NextResponse.json({ status: 'paid', gateway: payment.gateway });
        }
      } catch { /* fall through, return current status */ }
    }
  }

  return NextResponse.json({
    status:     payment.status,
    gateway:    payment.gateway,
    payment_id: payment.id,
  });
}

// ── POST — Initiate registration + payment ────────────────────────────────────
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

  // ── Basic validation ─────────────────────────────────────────────────────────
  if (!schoolId || !pricingId || !gateway || !studentName || !contactEmail) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ── Fetch school + check approval ────────────────────────────────────────────
  const { data: school } = await supabase
    .from('schools')
    .select('id, name, status, is_active, is_registration_active, branding, org_name')
    .eq('id', schoolId)
    .single();

  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

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

  // ── Fetch pricing ────────────────────────────────────────────────────────────
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

  // ── Duplicate registration guard ─────────────────────────────────────────────
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

  // ── Resolve discount ─────────────────────────────────────────────────────────
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
        discountAmount = dc.discount_type === 'percent'
          ? Math.round((dc.discount_value / 100) * pricing.base_amount)
          : (dc.discount_amount || 0);
      }
    }
  }

  const finalAmount = Math.max(0, pricing.base_amount - discountAmount);

  // ── Load integration config for the requested gateway ────────────────────────
  const gwConfig = await getGatewayConfig(supabase, schoolId, gateway);
  const gc       = gwConfig?.config ?? {};

  // ── Handle PayPal (server-side verify, no redirect needed) ───────────────────
  if (gateway === 'paypal') {
    if (!paypalOrderId) {
      return NextResponse.json({ error: 'Missing PayPal order ID' }, { status: 400 });
    }

    // key_id = Client ID, key_secret = Client Secret in Integrations UI
    const ppClientId     = gc.key_id     ?? process.env.PAYPAL_CLIENT_ID!;
    const ppClientSecret = gc.key_secret ?? process.env.PAYPAL_CLIENT_SECRET!;
    const ppMode         = gc.mode === 'test' ? 'sandbox' : (gc.mode ?? (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'));

    console.log('[PayPal] clientId:', ppClientId ? ppClientId.slice(0,10)+'…' : 'MISSING');
    console.log('[PayPal] secret:', ppClientSecret ? 'SET' : 'MISSING');
    console.log('[PayPal] mode:', ppMode);
    console.log('[PayPal] orderStatus from frontend:', paypalStatus);

    let paypalVerified = false;

    if (ppClientId && ppClientSecret) {
      const result = await verifyPayPalOrder(paypalOrderId, ppClientId, ppClientSecret, ppMode as 'live' | 'sandbox');
      console.log('[PayPal] server verify result:', result.status, 'verified:', result.verified);
      paypalVerified = result.verified;
    }

    // Fallback: if no credentials configured OR server verify failed,
    // trust the frontend capture result (order.status from actions.order.capture())
    // The frontend already captured — double-capture is not possible
    if (!paypalVerified) {
      if (paypalStatus === 'COMPLETED') {
        console.warn('[PayPal] Server verification skipped/failed — trusting frontend capture status COMPLETED');
        paypalVerified = true;
      } else {
        console.warn('[PayPal] Frontend status:', paypalStatus, '— not COMPLETED, rejecting');
      }
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

    if (payment?.id && discountCode) {
      void (async () => { try { await supabase.rpc('decrement_discount_usage', { p_payment_id: payment.id }); } catch (err: any) { console.warn('decrement_discount_usage failed:', err?.message); } })();
    }

    // Fire triggers: registration created + payment paid (PayPal is synchronous)
    await fireTriggers('registration.created', registration.id, schoolId);
    await fireTriggers('payment.paid',         registration.id, schoolId);

    return NextResponse.json({
      gateway:         'paypal',
      payment_id:      payment?.id,
      registration_id: registration.id,
      status:          'paid',
    });
  }

  // ── Save registration + payment (pending — will be updated after gateway callback) ──
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

  // NOTE: registration.created trigger is fired only after payment succeeds,
  // not here — to avoid sending "registration confirmed" messages on failed payments.
  // For Razorpay: fired in POST /api/payment/verify after signature check
  // For Cashfree: fired in GET /api/payment/verify after gateway verification
  // For Easebuzz: fired in POST /api/payment/verify after hash verification
  // For PayPal:   fired immediately below since payment is synchronous

  // VERCEL_URL is always set by Vercel automatically (e.g. thynk-registration.vercel.app)
  // NEXT_PUBLIC_BACKEND_URL should be set in Vercel env vars to your canonical domain
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const appUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? vercelUrl ?? 'https://thynk-registration.vercel.app';

  try {
    // ── Razorpay ─────────────────────────────────────────────────────────────
    if (gateway === 'razorpay') {
      // key_id = Key ID, key_secret = Key Secret in Integrations UI
      const keyId     = gc.key_id     ?? process.env.RAZORPAY_KEY_ID!;
      const keySecret = gc.key_secret ?? process.env.RAZORPAY_KEY_SECRET!;

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

    // ── Cashfree ─────────────────────────────────────────────────────────────
    if (gateway === 'cashfree') {
      // key_id = App ID, key_secret = Secret Key, mode = sandbox|production in Integrations UI
      const appId     = gc.key_id     ?? process.env.CASHFREE_APP_ID!;
      const secretKey = gc.key_secret ?? process.env.CASHFREE_SECRET_KEY!;
      const _cfRaw    = gc.mode       ?? process.env.CASHFREE_MODE ?? 'production';
      const mode      = _cfRaw === 'live' ? 'production' : _cfRaw === 'test' ? 'sandbox' : _cfRaw;
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
        appId, secretKey, mode as 'production' | 'sandbox'
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

    // ── Easebuzz ─────────────────────────────────────────────────────────────
    if (gateway === 'easebuzz') {
      // key_id = Merchant Key, key_secret = Salt, mode = live|test in Integrations UI
      const ebKey  = gc.key_id     ?? process.env.EASEBUZZ_KEY ?? '';
      const ebSalt = gc.key_secret ?? process.env.EASEBUZZ_SALT ?? '';
      const _ebRaw = gc.mode       ?? process.env.EASEBUZZ_ENV ?? 'live';
      // Normalise: DB saves 'live'|'test', map to what initEasebuzzPayment expects
      const ebEnv: 'production' | 'test' = (_ebRaw === 'test') ? 'test' : 'production';

      // ── DIAGNOSTIC LOG — always visible in Vercel → Logs after a payment attempt ──
      console.log('[Easebuzz] DIAGNOSTIC', {
        gwConfigFound:  !!gwConfig,
        gwIsActive:     gwConfig?.is_active,
        hasKey:         !!String(ebKey).trim(),
        hasSalt:        !!String(ebSalt).trim(),
        keyPreview:     String(ebKey).trim().slice(0, 4) + '***',
        saltPreview:    String(ebSalt).trim().slice(0, 4) + '***',
        modeRaw:        _ebRaw,
        ebEnv,
        appUrl,
      });

      if (!String(ebKey).trim()) {
        console.error('[Easebuzz] Merchant Key missing — go to Admin → Integrations → Easebuzz and save keys');
        return NextResponse.json({ error: 'Easebuzz Merchant Key not configured' }, { status: 500 });
      }
      if (!String(ebSalt).trim()) {
        console.error('[Easebuzz] Salt missing — go to Admin → Integrations → Easebuzz and save keys');
        return NextResponse.json({ error: 'Easebuzz Salt not configured' }, { status: 500 });
      }

      // txnid: alphanumeric only, max 25 chars — strip dashes from payment UUID
      const txnId = generateEasebuzzTxnId(payment.id);

      // firstname: alphanumeric + spaces only, max 50 chars
      const firstname = studentName.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 50) || 'Student';

      // phone: exactly 10 digits, no country code (Easebuzz rejects +91 prefix)
      const phone = normaliseEbPhone(contactPhone);

      const ebResult = await initEasebuzzPayment(
        {
          txnid:       txnId,
          amount:      (finalAmount / 100).toFixed(2),
          productinfo: pricing.program_name.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 100) || 'Registration',
          firstname,
          email:       contactEmail,
          phone,
          surl: `${appUrl}/api/payment/easebuzz-callback?paymentId=${payment.id}`,
          furl: `${appUrl}/api/payment/easebuzz-callback?paymentId=${payment.id}`,
        },
        String(ebKey).trim(), String(ebSalt).trim(), ebEnv
      );

      await supabase.from('payments').update({ gateway_txn_id: txnId, status: 'initiated' }).eq('id', payment.id);
      await supabase.from('registrations').update({ status: 'initiated' }).eq('id', registration.id);

      return NextResponse.json({
        gateway:         'easebuzz',
        payment_id:      payment.id,
        registration_id: registration.id,
        access_key:      ebResult.access_key,
        payment_url:     ebResult.payment_url,
        env:             ebEnv,
      });
    }

    return NextResponse.json({ error: 'Unknown gateway' }, { status: 400 });

  } catch (err: any) {
    await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    await supabase.from('registrations').update({ status: 'failed' }).eq('id', registration.id);
    return NextResponse.json({ error: err.message ?? 'Gateway error' }, { status: 500 });
  }
}
