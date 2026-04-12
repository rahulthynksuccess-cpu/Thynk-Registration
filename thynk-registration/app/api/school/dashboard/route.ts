import { NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Get school(s) this user has access to
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id, schools(id, school_code, name, org_name, city, state, country, is_active, project_slug)')
    .eq('user_id', user.id);

  if (!roleRows?.length) return NextResponse.json({ error: 'No school access' }, { status: 403 });

  const isSuperAdmin = roleRows.some(r => r.role === 'super_admin' && !r.school_id);
  const schoolRole   = roleRows.find(r => r.role === 'school_admin' && r.school_id);

  if (!isSuperAdmin && !schoolRole)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const schoolId = schoolRole?.school_id;
  const school   = (schoolRole as any)?.schools;

  // Fetch all registrations for this school
  let query = service
    .from('registrations')
    .select(`
      id, created_at, student_name, class_grade, gender, parent_school, city,
      parent_name, contact_phone, contact_email, status,
      pricing(program_name, base_amount),
      payments(gateway, gateway_txn_id, base_amount, discount_amount, final_amount,
               discount_code, status, paid_at)
    `)
    .order('created_at', { ascending: false });

  if (!isSuperAdmin && schoolId) {
    query = query.eq('school_id', schoolId);
  }

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten rows
  const flat = (rows ?? []).map((r: any) => {
    const payment = r.payments?.[0] ?? {};
    return {
      id:              r.id,
      created_at:      r.created_at,
      student_name:    r.student_name,
      class_grade:     r.class_grade,
      gender:          r.gender,
      parent_school:   r.parent_school,
      city:            r.city,
      parent_name:     r.parent_name,
      contact_phone:   r.contact_phone,
      contact_email:   r.contact_email,
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

  // ── Aggregations ──────────────────────────────────────────────────
  const total    = flat.length;
  const paid     = flat.filter(r => r.payment_status === 'paid');
  const unpaid   = flat.filter(r => r.payment_status !== 'paid');
  const pending  = flat.filter(r => ['pending','initiated'].includes(r.payment_status ?? ''));
  const failed   = flat.filter(r => ['failed','cancelled'].includes(r.payment_status ?? ''));
  const totalRev = paid.reduce((s, r) => s + (r.final_amount ?? 0), 0);

  // Class-wise counts
  const byClass: Record<string, { total: number; paid: number; unpaid: number }> = {};
  flat.forEach(r => {
    const cls = r.class_grade || 'Unknown';
    if (!byClass[cls]) byClass[cls] = { total: 0, paid: 0, unpaid: 0 };
    byClass[cls].total++;
    if (r.payment_status === 'paid') byClass[cls].paid++;
    else byClass[cls].unpaid++;
  });

  // Gender-wise counts
  const byGender: Record<string, { total: number; paid: number }> = {};
  flat.forEach(r => {
    const g = r.gender || 'Unknown';
    if (!byGender[g]) byGender[g] = { total: 0, paid: 0 };
    byGender[g].total++;
    if (r.payment_status === 'paid') byGender[g].paid++;
  });

  // Class × Gender cross-tab
  const crossTab: Record<string, Record<string, number>> = {};
  flat.forEach(r => {
    const cls = r.class_grade || 'Unknown';
    const g   = r.gender      || 'Unknown';
    if (!crossTab[cls]) crossTab[cls] = {};
    crossTab[cls][g] = (crossTab[cls][g] ?? 0) + 1;
  });

  // Daily registrations (last 30 days)
  const now = new Date();
  const dailyMap: Record<string, { total: number; paid: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d  = new Date(now);
    d.setDate(d.getDate() - i);
    dailyMap[d.toISOString().slice(0, 10)] = { total: 0, paid: 0 };
  }
  flat.forEach(r => {
    const ds = r.created_at?.slice(0, 10);
    if (ds && dailyMap[ds]) {
      dailyMap[ds].total++;
      if (r.payment_status === 'paid') dailyMap[ds].paid++;
    }
  });

  return NextResponse.json({
    school,
    stats: { total, paid: paid.length, unpaid: unpaid.length, pending: pending.length, failed: failed.length, totalRev },
    byClass,
    byGender,
    crossTab,
    daily: dailyMap,
    rows: flat,
  });
}
