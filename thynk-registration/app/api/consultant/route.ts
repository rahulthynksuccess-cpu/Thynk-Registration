// app/api/consultant/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { deduplicateRegistrations } from '@/lib/dedup';

async function getConsultantUser(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'consultant').is('school_id', null).maybeSingle();
  return data ? user : null;
}

export async function GET(req: NextRequest) {
  const user = await getConsultantUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolIdFilter = searchParams.get('school_id');

  const { data: profile } = await service
    .from('consultant_profiles').select('consultant_code, is_default_consultant')
    .eq('user_id', user.id).maybeSingle();

  // Fetch active programs (using service client — bypasses super_admin RLS)
  const { data: programs } = await service
    .from('projects')
    .select('id, name, slug, status, base_amount_inr, base_amount_usd, base_amount')
    .eq('status', 'active')
    .order('name');

  const { data: mySchools, error: schoolErr } = await service
    .from('schools')
    .select(`id, school_code, name, org_name, city, state, country,
      is_active, is_registration_active, status, created_at, project_slug,
      pricing (id, program_name, base_amount, currency, is_active)`)
    .eq('consultant_id', user.id)
    .order('created_at', { ascending: false });

  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  if (!mySchools?.length) {
    return NextResponse.json({ schools: [], stats: null, rows: [], bySchool: {}, consultantCode: profile?.consultant_code ?? null, programs: programs ?? [] });
  }

  const schoolIds = schoolIdFilter ? [schoolIdFilter] : mySchools.map(s => s.id);
  const { data: rows, error: regErr } = await service
    .from('registrations')
    .select(`id, created_at, school_id, student_name, class_grade, gender,
      parent_school, city, parent_name, contact_phone, contact_email, status,
      schools(name), pricing(program_name, base_amount),
      payments(gateway, base_amount, discount_amount, final_amount, discount_code, status, paid_at)`)
    .in('school_id', schoolIds)
    .order('created_at', { ascending: false });

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  const flat = (rows ?? []).map((r: any) => {
    const allPay: any[] = Array.isArray(r.payments) ? r.payments : r.payments ? [r.payments] : [];
    const RANK: Record<string, number> = { paid:0, pending:1, initiated:1, failed:2, cancelled:2 };
    const pay = [...allPay].sort((a,b) => (RANK[a.status]??9)-(RANK[b.status]??9))[0] ?? {};
    return {
      id: r.id, created_at: r.created_at, school_id: r.school_id ?? null,
      school_name: (r.schools as any)?.name ?? null,
      student_name: r.student_name, class_grade: r.class_grade, gender: r.gender,
      parent_name: r.parent_name, contact_phone: r.contact_phone, contact_email: r.contact_email,
      program_name: (r.pricing as any)?.program_name ?? null,
      final_amount: pay.final_amount ?? 0,
      payment_status: pay.status ?? null, paid_at: pay.paid_at ?? null,
    };
  });

  const deduped  = deduplicateRegistrations(flat);
  const paid     = deduped.filter(r => r.payment_status === 'paid');
  const pending  = deduped.filter(r => ['pending','initiated'].includes(r.payment_status ?? ''));
  const totalRev = paid.reduce((s,r) => s + (r.final_amount ?? 0), 0);

  const bySchool: Record<string, any> = {};
  for (const s of mySchools) bySchool[s.id] = { name:s.name, total:0, paid:0, pending:0, revenue:0 };
  for (const r of deduped) {
    if (r.school_id && bySchool[r.school_id]) {
      bySchool[r.school_id].total++;
      if (r.payment_status === 'paid') { bySchool[r.school_id].paid++; bySchool[r.school_id].revenue += r.final_amount ?? 0; }
      else if (['pending','initiated'].includes(r.payment_status ?? '')) bySchool[r.school_id].pending++;
    }
  }

  return NextResponse.json({
    schools: mySchools,
    stats: { total: deduped.length, paid: paid.length, pending: pending.length, totalRev, schoolCount: mySchools.length },
    bySchool, rows: deduped,
    consultantCode: profile?.consultant_code ?? null,
    programs: programs ?? [],
  });
}
