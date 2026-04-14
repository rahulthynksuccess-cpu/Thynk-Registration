import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { deduplicateRegistrations } from '@/lib/dedup';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolCode = searchParams.get('schoolCode');
  const status     = searchParams.get('status');
  const search     = searchParams.get('q');
  const page       = parseInt(searchParams.get('page') ?? '1');
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '500'), 1000);
  const offset     = (page - 1) * limit;

  // Determine which school IDs this user can access
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id')
    .eq('user_id', user.id);

  const isSuperAdmin     = roleRows?.some(r => r.role === 'super_admin' && !r.school_id);
  const allowedSchoolIds = roleRows?.map(r => r.school_id).filter(Boolean) ?? [];

  // Resolve schoolCode → school_id (FIX: dot notation doesn't work in Supabase filters)
  let schoolIdFromCode: string | null = null;
  if (schoolCode) {
    const { data: schoolData } = await service
      .from('schools')
      .select('id')
      .eq('school_code', schoolCode)
      .single();
    schoolIdFromCode = schoolData?.id ?? null;
  }

  // Build query — FIX: removed !inner so rows without a school are not silently dropped
  let query = service
    .from('registrations')
    .select(`
      id,
      created_at,
      student_name,
      class_grade,
      gender,
      parent_school,
      city,
      parent_name,
      contact_phone,
      contact_email,
      status,
      schools(
        id,
        school_code,
        name,
        org_name,
        country,
        state,
        project_slug,
        project_id,
        branding,
        pricing(program_name, base_amount, currency),
        projects:project_id(slug, base_url)
      ),
      payments(
        gateway,
        gateway_txn_id,
        base_amount,
        discount_amount,
        final_amount,
        discount_code,
        status,
        paid_at
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!isSuperAdmin) {
    if (!allowedSchoolIds.length) return NextResponse.json({ rows: [], count: 0 });
    query = query.in('school_id', allowedSchoolIds);
  }

  if (schoolIdFromCode) {
    query = query.eq('school_id', schoolIdFromCode);
  }

  if (status) {
    // status can refer to payment status — filter after flattening
    // (registration status and payment status are different columns)
  }

  const { data: rows, count, error } = await query;

  if (error) {
    console.error('[registrations] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten for dashboard consumption
  // FIX: pricing is nested under schools, not directly on registrations
  const flat = (rows ?? []).map((r: any) => {
    // Pick the BEST payment record for this registration:
    // paid > pending/initiated > failed/cancelled > anything else
    // This prevents a failed-payment record shadowing a later paid one.
    const allPayments: any[] = Array.isArray(r.payments) ? r.payments : r.payments ? [r.payments] : [];
    const PAY_RANK: Record<string, number> = { paid: 0, pending: 1, initiated: 1, failed: 2, cancelled: 2 };
    // [...spread] before sort — never mutate the original Supabase response object
    const payment = [...allPayments].sort((a, b) =>
      (PAY_RANK[a.status] ?? 9) - (PAY_RANK[b.status] ?? 9)
    )[0] ?? {};
    const school  = r.schools ?? {};
    // FIX: pricing lives under schools
    const pricing = Array.isArray(school.pricing) ? (school.pricing[0] ?? {}) : (school.pricing ?? {});

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
      school_id:       school.id        ?? null,
      school_code:     school.school_code ?? null,
      school_name:     school.name       ?? null,
      org_name:        school.org_name   ?? null,
      project_slug:    school.project_slug ?? null,
      // Build registration URL with priority:
      // 1. branding.redirectURL (set at school creation — exact URL)
      // 2. program slug + base_url from projects table join
      // 3. school.project_slug + school_code (last resort)
      registration_url: (() => {
        if (school.branding?.redirectURL) return school.branding.redirectURL;
        const prog = school.projects ?? {};
        const slug = prog.slug ?? school.project_slug;
        const baseUrl = prog.base_url ?? 'https://www.thynksuccess.com';
        if (slug && school.school_code) return `${baseUrl}/registration/${slug}/${school.school_code}`;
        return null;
      })(),
      country:         school.country    ?? 'India',
      state:           school.state      ?? null,
      // FIX: program_name and currency now come from school.pricing
      program_name:    pricing.program_name ?? null,
      currency:        pricing.currency     ?? 'INR',
      gateway:         payment.gateway           ?? null,
      gateway_txn_id:  payment.gateway_txn_id    ?? null,
      base_amount:     payment.base_amount        ?? pricing.base_amount ?? 0,
      discount_amount: payment.discount_amount    ?? 0,
      final_amount:    payment.final_amount       ?? 0,
      discount_code:   payment.discount_code      ?? null,
      // FIX: explicitly map payment.status so dashboard filters work correctly
      payment_status:  payment.status             ?? null,
      paid_at:         payment.paid_at            ?? null,
    };
  });

  // ── Deduplication ────────────────────────────────────────────────────────
  // If the same student (matched by school + name + phone + email) has both a
  // paid and non-paid registration, suppress the non-paid duplicate.
  const deduped = deduplicateRegistrations(flat);

  // Apply payment status filter after flattening
  let filtered = deduped;
  if (status) {
    filtered = deduped.filter((r: any) => r.payment_status === status);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r => {
      const hay = [
        r.student_name,
        r.parent_name,
        r.contact_phone,
        r.contact_email,
        r.parent_school,
        r.city,
        r.gateway_txn_id,
        r.school_name,
        r.school_code,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  return NextResponse.json({ rows: filtered, count: filtered.length });
}
