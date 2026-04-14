/**
 * GET /api/school/preview-token?token=<token>
 * Returns full school dashboard data without requiring a Supabase session.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyPreviewToken } from '@/lib/preview-token';
import { deduplicateRegistrations } from '@/lib/dedup';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const verified = verifyPreviewToken(token);
  if (!verified) {
    return NextResponse.json({
      error: 'Invalid or expired preview link. Please generate a new dashboard link from the admin panel.',
    }, { status: 401 });
  }

  const { schoolId } = verified;
  const service = createServiceClient();

  const { data: schoolData } = await service
    .from('schools')
    .select('id, school_code, name, org_name, city, state, country, is_active, project_slug')
    .eq('id', schoolId)
    .single();
  if (!schoolData) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const { data: rows, error } = await service
    .from('registrations')
    .select(`
      id, created_at, student_name, class_grade, gender, parent_school, city,
      parent_name, contact_phone, contact_email, status,
      pricing(program_name, base_amount),
      payments(gateway, gateway_txn_id, base_amount, discount_amount, final_amount,
               discount_code, status, paid_at)
    `)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flat = (rows ?? []).map((r: any) => {
    const allPayments: any[] = Array.isArray(r.payments) ? r.payments : r.payments ? [r.payments] : [];
    const PAY_RANK: Record<string, number> = { paid: 0, pending: 1, initiated: 1, failed: 2, cancelled: 2 };
    const payment = [...allPayments].sort((a, b) =>
      (PAY_RANK[a.status] ?? 9) - (PAY_RANK[b.status] ?? 9)
    )[0] ?? {};
    return {
      id: r.id, created_at: r.created_at,
      student_name: r.student_name, class_grade: r.class_grade,
      gender: r.gender, parent_school: r.parent_school, city: r.city,
      parent_name: r.parent_name, contact_phone: r.contact_phone,
      contact_email: r.contact_email,
      program_name:    r.pricing?.program_name ?? null,
      gateway:         payment.gateway         ?? null,
      gateway_txn_id:  payment.gateway_txn_id  ?? null,
      base_amount:     payment.base_amount      ?? r.pricing?.base_amount ?? 0,
      discount_amount: payment.discount_amount  ?? 0,
      final_amount:    payment.final_amount     ?? 0,
      discount_code:   payment.discount_code    ?? null,
      payment_status:  payment.status           ?? null,
      paid_at:         payment.paid_at          ?? null,
    };
  });

  const deduped  = deduplicateRegistrations(flat);
  const paid     = deduped.filter(r => r.payment_status === 'paid');
  const unpaid   = deduped.filter(r => r.payment_status !== 'paid');
  const pending  = deduped.filter(r => ['pending','initiated'].includes(r.payment_status ?? ''));
  const failed   = deduped.filter(r => ['failed','cancelled'].includes(r.payment_status ?? ''));
  const totalRev = paid.reduce((s, r) => s + (r.final_amount ?? 0), 0);

  const byClass: Record<string,number> = {};
  const byGender: Record<string,number> = {};
  const crossTab: Record<string,Record<string,number>> = {};
  paid.forEach(r => {
    const c = r.class_grade || 'Unknown'; byClass[c] = (byClass[c] ?? 0) + 1;
    const g = r.gender      || 'Unknown'; byGender[g] = (byGender[g] ?? 0) + 1;
    if (!crossTab[c]) crossTab[c] = {};
    crossTab[c][g] = (crossTab[c][g] ?? 0) + 1;
  });

  const now = new Date();
  const dailyMap: Record<string,{total:number;paid:number}> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().slice(0, 10)] = { total: 0, paid: 0 };
  }
  deduped.forEach(r => {
    const ds = r.created_at?.slice(0, 10);
    if (ds && dailyMap[ds]) {
      dailyMap[ds].total++;
      if (r.payment_status === 'paid') dailyMap[ds].paid++;
    }
  });

  return NextResponse.json({
    school: schoolData,
    stats: { total: deduped.length, paid: paid.length, unpaid: unpaid.length, pending: pending.length, failed: failed.length, totalRev },
    byClass, byGender, crossTab, daily: dailyMap, rows: deduped,
    preview_mode: true,
  });
}
