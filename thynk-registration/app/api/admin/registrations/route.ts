import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolCode = searchParams.get('schoolCode');
  const status     = searchParams.get('status');
  const gateway    = searchParams.get('gateway');
  const search     = searchParams.get('q');
  const page       = parseInt(searchParams.get('page') ?? '1');
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '500'), 1000);
  const offset     = (page - 1) * limit;

  // Determine which school IDs this user can access
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id')
    .eq('user_id', user.id);

  const isSuperAdmin = roleRows?.some(r => r.role === 'super_admin' && !r.school_id);
  const allowedSchoolIds = roleRows?.map(r => r.school_id).filter(Boolean) ?? [];

  // Build query — added country, state to schools join; currency to pricing join
  let query = service
    .from('registrations')
    .select(`
      id, created_at, student_name, class_grade, gender, parent_school, city,
      parent_name, contact_phone, contact_email, status,
      schools!inner(id, school_code, name, org_name, country, state),
      pricing(program_name, base_amount, currency),
      payments(gateway, gateway_txn_id, base_amount, discount_amount, final_amount, discount_code, status, paid_at)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!isSuperAdmin) {
    if (!allowedSchoolIds.length) return NextResponse.json({ rows: [], count: 0 });
    query = query.in('school_id', allowedSchoolIds);
  }

  if (schoolCode) {
    query = query.eq('schools.school_code', schoolCode);
  }

  if (status) query = query.eq('status', status);

  const { data: rows, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten for dashboard consumption
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
      reg_status:      r.status,
      school_code:     r.schools?.school_code,
      school_name:     r.schools?.name,
      country:         r.schools?.country ?? 'India',
      state:           r.schools?.state   ?? null,
      program_name:    r.pricing?.program_name,
      currency:        r.pricing?.currency ?? 'INR',
      gateway:         payment.gateway        ?? null,
      gateway_txn_id:  payment.gateway_txn_id ?? null,
      base_amount:     payment.base_amount    ?? r.pricing?.base_amount ?? 0,
      discount_amount: payment.discount_amount ?? 0,
      final_amount:    payment.final_amount   ?? 0,
      discount_code:   payment.discount_code  ?? null,
      payment_status:  payment.status         ?? null,
      paid_at:         payment.paid_at        ?? null,
    };
  });

  // Search filter
  const filtered = search
    ? flat.filter(r => {
        const hay = [r.student_name, r.parent_name, r.contact_phone, r.contact_email, r.parent_school, r.city, r.gateway_txn_id].join(' ').toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : flat;

  return NextResponse.json({ rows: filtered, count: count ?? filtered.length });
}
