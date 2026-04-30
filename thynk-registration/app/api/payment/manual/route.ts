// app/api/admin/payment/manual/route.ts
//
// POST — Admin manually marks a student payment as paid.
//        Creates a payment record (or updates existing pending one)
//        with all the same fields that an online payment would set,
//        then fires the registration.created + payment.paid triggers.
//
// Body (JSON):
//   registration_id  string  — the registration UUID
//   gateway          string  — 'razorpay' | 'cashfree' | 'easebuzz' | 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'other'
//   gateway_txn_id   string  — transaction / reference ID (free text)
//   base_amount      number  — in paise (or cents)
//   discount_amount  number  — in paise, default 0
//   final_amount     number  — in paise
//   discount_code    string? — optional
//   paid_at          string? — ISO timestamp, defaults to now
//   notes            string? — admin note stored in gateway_response
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient }       from '@/lib/supabase/server';
import { fireTriggers }              from '@/lib/triggers/fire';

// Gateways supported for manual entry (extends the online ones with offline modes)
const ALLOWED_GATEWAYS = [
  'razorpay', 'cashfree', 'easebuzz',
  'cash', 'bank_transfer', 'cheque', 'upi', 'other',
] as const;

type ManualGateway = (typeof ALLOWED_GATEWAYS)[number];

async function fireSuccessTriggers(registrationId: string, schoolId: string) {
  await fireTriggers('registration.created', registrationId, schoolId);
  await fireTriggers('payment.paid',         registrationId, schoolId);
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // ── Auth: must be a logged-in admin ──────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Verify the caller is an admin_role row
  const { data: role } = await supabase
    .from('admin_roles').select('id').eq('user_id', user.id).maybeSingle();
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────
  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const {
    registration_id,
    gateway,
    gateway_txn_id,
    base_amount,
    discount_amount = 0,
    final_amount,
    discount_code,
    paid_at,
    notes,
  } = body;

  // ── Validate required fields ──────────────────────────────────────
  if (!registration_id) {
    return NextResponse.json({ error: 'registration_id is required' }, { status: 400 });
  }
  if (!gateway || !ALLOWED_GATEWAYS.includes(gateway as ManualGateway)) {
    return NextResponse.json({
      error: `gateway must be one of: ${ALLOWED_GATEWAYS.join(', ')}`,
    }, { status: 400 });
  }
  if (typeof final_amount !== 'number' || final_amount <= 0) {
    return NextResponse.json({ error: 'final_amount must be a positive number (in paise)' }, { status: 400 });
  }

  // ── Load registration ─────────────────────────────────────────────
  const { data: reg } = await supabase
    .from('registrations')
    .select('id, school_id, status')
    .eq('id', registration_id)
    .maybeSingle();
  if (!reg) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }

  const paidAt       = paid_at ? new Date(paid_at).toISOString() : new Date().toISOString();
  const gatewayForDb = ALLOWED_GATEWAYS.slice(0, 3).includes(gateway as any)
    ? (gateway as 'razorpay' | 'cashfree' | 'easebuzz')
    : 'razorpay'; // DB check constraint only allows online gateways; store offline mode in gateway_response

  const gatewayResponse = {
    manual:     true,
    recorded_by: user.email ?? user.id,
    recorded_at: new Date().toISOString(),
    offline_gateway: ALLOWED_GATEWAYS.slice(0, 3).includes(gateway as any) ? null : gateway,
    notes:      notes ?? null,
  };

  // ── Upsert payment: update pending/initiated row, or insert fresh ─
  const { data: existing } = await supabase
    .from('payments')
    .select('id, status')
    .eq('registration_id', registration_id)
    .in('status', ['pending', 'initiated', 'failed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let paymentId: string;

  if (existing) {
    const { data: updated, error: updErr } = await supabase
      .from('payments')
      .update({
        status:           'paid',
        gateway:           gatewayForDb,
        gateway_txn_id:    gateway_txn_id || null,
        base_amount:       base_amount    ?? final_amount,
        discount_amount:   discount_amount,
        final_amount:      final_amount,
        discount_code:     discount_code  || null,
        gateway_response:  gatewayResponse,
        paid_at:           paidAt,
      })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (updErr) {
      console.error('[manual payment] update error', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    paymentId = updated!.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('payments')
      .insert({
        registration_id,
        school_id:        reg.school_id,
        gateway:           gatewayForDb,
        gateway_txn_id:    gateway_txn_id || null,
        base_amount:       base_amount    ?? final_amount,
        discount_amount:   discount_amount,
        final_amount:      final_amount,
        discount_code:     discount_code  || null,
        status:           'paid',
        gateway_response:  gatewayResponse,
        paid_at:           paidAt,
      })
      .select('id')
      .single();
    if (insErr) {
      console.error('[manual payment] insert error', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    paymentId = inserted!.id;
  }

  // ── Update registration status ────────────────────────────────────
  await supabase
    .from('registrations')
    .update({ status: 'paid' })
    .eq('id', registration_id);

  // ── Decrement discount usage if applicable ────────────────────────
  if (discount_code) {
    try { await supabase.rpc('decrement_discount_usage', { p_payment_id: paymentId }); } catch (_) {}
  }

  // ── Fire triggers (same as online success) ────────────────────────
  await fireSuccessTriggers(registration_id, reg.school_id);

  return NextResponse.json({
    success:    true,
    payment_id: paymentId,
    status:    'paid',
    paid_at:    paidAt,
  });
}
