// app/api/admin/schools/route.ts
// Full CRUD for schools — GET supports ?status= filter for approval queue

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .is('school_id', null)
    .single();
  return data ? user : null;
}

// Returns user + their role if they are super_admin OR consultant
async function requireSuperAdminOrConsultant(req: NextRequest): Promise<{ user: any; role: string } | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'consultant']);
  const isSuperAdmin = roleRows?.some(r => r.role === 'super_admin');
  const isConsultant = roleRows?.some(r => r.role === 'consultant');
  if (isSuperAdmin) return { user, role: 'super_admin' };
  if (isConsultant)  return { user, role: 'consultant' };
  return null;
}

function currencyForCountry(country: string): string {
  return (country || '').toLowerCase() === 'india' ? 'INR' : 'USD';
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id, all_schools')
    .eq('user_id', user.id);

  const isSuperAdmin  = roleRows?.some(r => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin    = roleRows?.some(r => r.role === 'sub_admin');
  const isConsultant  = roleRows?.some(r => r.role === 'consultant');

  if (!isSuperAdmin && !isSubAdmin && !isConsultant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  let query = service
    .from('schools')
    .select(`
      id, school_code, name, org_name, logo_url, branding, gateway_config,
      is_active, is_registration_active, status, approved_at, approved_by,
      city, state, country, address, pin_code, contact_persons,
      project_id, project_slug, discount_code, created_at, consultant_id,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active, grade_prices_inr, grade_prices_usd)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter) as any;
  }

  if (isSubAdmin && !isSuperAdmin) {
    const hasAllSchools = roleRows?.some(r => r.role === 'sub_admin' && r.all_schools);
    if (!hasAllSchools) {
      const allowedIds = roleRows
        ?.filter(r => r.role === 'sub_admin' && r.school_id)
        .map(r => r.school_id) ?? [];
      if (!allowedIds.length) return NextResponse.json({ schools: [] });
      query = query.in('id', allowedIds) as any;
    }
  }

  if (isConsultant && !isSuperAdmin) {
    query = query.eq('consultant_id', user.id) as any;
  }

  const { data: schools } = await query;
  const schoolRows = schools ?? [];

  // ── Enrich with Program Name, Consultant Name, and Paid/Total student counts ──
  // (kept as a lightweight second pass so the base query above stays untouched)
  const schoolIds      = schoolRows.map((s: any) => s.id);
  const consultantIds  = Array.from(new Set(schoolRows.map((s: any) => s.consultant_id).filter(Boolean)));

  // Consultant names — consultant_profiles.user_id is the FK; display name comes from auth user metadata
  const consultantNameMap: Record<string, string> = {};
  if (consultantIds.length) {
    const { data: profiles } = await service
      .from('consultant_profiles')
      .select('user_id, consultant_code')
      .in('user_id', consultantIds);
    const codeMap: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => { if (p.user_id) codeMap[p.user_id] = p.consultant_code; });

    await Promise.all(consultantIds.map(async (uid: string) => {
      try {
        const { data: u } = await service.auth.admin.getUserById(uid);
        consultantNameMap[uid] = u?.user?.user_metadata?.name || codeMap[uid] || u?.user?.email || '—';
      } catch {
        consultantNameMap[uid] = codeMap[uid] ?? '—';
      }
    }));
  }

  // Paid / Failed registration counts per school (registrations.status mirrors payment status)
  const paidCountMap: Record<string, number> = {};
  const failedCountMap: Record<string, number> = {};
  if (schoolIds.length) {
    const { data: regRows } = await service
      .from('registrations')
      .select('school_id, status')
      .in('school_id', schoolIds);
    (regRows ?? []).forEach((r: any) => {
      if (r.status === 'paid')   paidCountMap[r.school_id]   = (paidCountMap[r.school_id]   ?? 0) + 1;
      if (r.status === 'failed') failedCountMap[r.school_id] = (failedCountMap[r.school_id] ?? 0) + 1;
    });
  }

  const enriched = schoolRows.map((s: any) => {
    // A school can end up with more than one pricing row over time (e.g. price
    // revisions). Prefer the active one so `program_name` doesn't silently
    // resolve to a stale/inactive row (or the wrong one, since Supabase does
    // not guarantee array order here).
    const pricingRows = Array.isArray(s.pricing) ? s.pricing : (s.pricing ? [s.pricing] : []);
    const pricingRow  = pricingRows.find((p: any) => p.is_active) ?? pricingRows[0];
    const paid   = paidCountMap[s.id]   ?? 0;
    const failed = failedCountMap[s.id] ?? 0;
    return {
      ...s,
      program_name:        pricingRow?.program_name ?? null,
      consultant_name:     s.consultant_id ? (consultantNameMap[s.consultant_id] ?? null) : null,
      paid_student_count:  paid,
      total_student_count: paid + failed, // Paid + Failed transactions
    };
  });

  return NextResponse.json({ schools: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminOrConsultant(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { user, role: callerRole } = auth;

  const service = createServiceClient();
  const body = await req.json();
  const {
    school_code, name, org_name,
    city, state, country,
    address, pin_code, contact_persons,
    project_id, school_price, currency: bodyCurrency,
    discount_code,
    primary_color, accent_color,
    is_active, is_registration_active,
    consultant_id: bodyConsultantId,
    // Class/grade-wise pricing for this school (see migration 009).
    // grade_specific_pricing: true  → grade_prices_inr/usd are stored & used at checkout.
    // grade_specific_pricing: false/omitted → school uses flat school_price for every grade.
    grade_specific_pricing,
    grade_prices_inr: bodyGradePricesInr,
    grade_prices_usd: bodyGradePricesUsd,
  } = body;

  if (!school_code || !name || !org_name || !project_id || !school_price)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const resolvedCountry  = country || 'India';
  const resolvedCurrency = bodyCurrency || currencyForCountry(resolvedCountry);

  const { data: program } = await service
    .from('projects')
    .select('slug, name, base_url, grade_prices_inr, grade_prices_usd')
    .eq('id', project_id)
    .single();
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 400 });

  const code        = school_code.toLowerCase().replace(/\s+/g, '-');
  const redirectURL = `https://thynksuccess.com/registration/${program.slug}/?school=${code}`;
  const discCode    = (discount_code || code).toUpperCase();

  const resolvedConsultantId =
    callerRole === 'consultant' ? user.id : (bodyConsultantId || null);

  const { data: school, error } = await service
    .from('schools')
    .insert({
      school_code:            code,
      name,
      org_name,
      city:                   city     || null,
      state:                  state    || null,
      country:                resolvedCountry,
      address:                address  || null,
      pin_code:               pin_code || null,
      contact_persons:        contact_persons || [],
      project_id,
      project_slug:           program.slug,
      discount_code:          discCode,
      consultant_id:          resolvedConsultantId,
      status:                 'approved',
      is_active:              is_active !== false,
      is_registration_active: is_registration_active !== false,
      approved_at:            new Date().toISOString(),
      approved_by:            user.id,
      branding: {
        primaryColor: primary_color || '#4f46e5',
        accentColor:  accent_color  || '#8b5cf6',
        redirectURL,
      },
      gateway_config: {},
    })
    .select()
    .single();

  if (error)
    return NextResponse.json(
      { error: error.code === '23505' ? 'School code already exists' : error.message },
      { status: 400 }
    );

  // ── Class/grade-wise pricing ────────────────────────────────────────────
  // Only persist a grade_prices map when the program actually has grade-specific
  // pricing configured AND the admin has enabled it for this school. Otherwise
  // this school uses flat `school_price` for every grade (existing behavior).
  const programHasGradePricing = resolvedCurrency === 'INR'
    ? !!(program.grade_prices_inr && Object.keys(program.grade_prices_inr).length)
    : !!(program.grade_prices_usd && Object.keys(program.grade_prices_usd).length);

  const useGradePricing = !!grade_specific_pricing && programHasGradePricing;

  await service.from('pricing').insert({
    school_id:        school.id,
    program_name:     program.name,
    base_amount:      Math.round(Number(school_price)),
    currency:         resolvedCurrency,
    gateway_sequence: resolvedCurrency === 'INR'
      ? ['cashfree', 'razorpay', 'easebuzz']
      : ['paypal', 'razorpay'],
    is_active: true,
    grade_prices_inr: useGradePricing && resolvedCurrency === 'INR' ? (bodyGradePricesInr ?? null) : null,
    grade_prices_usd: useGradePricing && resolvedCurrency === 'USD' ? (bodyGradePricesUsd ?? null) : null,
  });

  void service.from('discount_codes').insert({
    school_id:       school.id,
    code:            discCode,
    discount_amount: 0,
    is_active:       true,
    max_uses:        null,
  });

  // ── AUTO-GENERATE LETTER ───────────────────────────────────────────────────
  try {
    const { data: template } = await service
      .from('letter_templates')
      .select('id')
      .eq('project_id', project_id)
      .eq('is_active', true)
      .single();

    if (template) {
      const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const authHeader = req.headers.get('Authorization') ?? '';
      fetch(`${baseUrl}/api/admin/generate-letter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          schoolId:    school.id,
          projectId:   project_id,
          triggeredBy: 'auto_school_create',
        }),
      }).catch(err => {
        console.error('[auto-letter] Failed to queue letter generation:', err);
      });
    }
  } catch (err) {
    console.error('[auto-letter] Template lookup failed:', err);
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── AUTO-CREATE USERS FOR ALL CONTACT PERSONS ─────────────────────────────
  const contacts: any[] = Array.isArray(contact_persons) ? contact_persons : [];
  const createdUsers: { email: string; status: string }[] = [];

  for (const contact of contacts) {
    const email  = (contact.email  || '').trim();
    const mobile = (contact.mobile || contact.phone || '').trim();

    if (!email) continue;

    const password = mobile || 'ThynkSchool@123';

    try {
      const { data: newUser, error: authErr } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authErr) {
        createdUsers.push({ email, status: authErr.message });
        continue;
      }

      await service.from('admin_roles').insert({
        user_id:   newUser.user.id,
        role:      'school_admin',
        school_id: school.id,
      });

      createdUsers.push({ email, status: 'created' });
    } catch (err: any) {
      createdUsers.push({ email, status: err?.message ?? 'error' });
    }
  }

  if (createdUsers.length > 0) {
    void service.from('activity_logs').insert({
      user_id:     user.id,
      school_id:   school.id,
      action:      'school.users_created',
      entity_type: 'school',
      entity_id:   school.id,
      metadata:    { created_users: createdUsers },
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ school, created_users: createdUsers }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const {
    id,
    school_code: bodySchoolCode,
    school_price,
    currency: bodyCurrency,
    primary_color, accent_color,
    project_id,
    country,
    discount_code,
    address, pin_code, contact_persons,
    is_registration_active,
    consultant_id: patchConsultantId,
    // Class/grade-wise pricing — these live on the `pricing` table, not `schools`,
    // so pull them out of `rest` before it gets spread into the schools update.
    grade_specific_pricing,
    grade_prices_inr: bodyGradePricesInr,
    grade_prices_usd: bodyGradePricesUsd,
    ...rest
  } = await req.json();

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: existing } = await service
    .from('schools')
    .select('branding, project_slug, country, discount_code, school_code, status')
    .eq('id', id)
    .single();

  let branding = existing?.branding ?? {};
  if (primary_color) branding = { ...branding, primaryColor: primary_color };
  if (accent_color)  branding = { ...branding, accentColor:  accent_color  };

  const resolvedCountry  = country || existing?.country || 'India';
  const resolvedCurrency = bodyCurrency || currencyForCountry(resolvedCountry);

  // Normalise the school code the same way it's normalised on creation
  // (lowercase, spaces → hyphens) so edits stay consistent with new schools.
  const resolvedSchoolCode = bodySchoolCode !== undefined
    ? String(bodySchoolCode).trim().toLowerCase().replace(/\s+/g, '-')
    : undefined;
  const schoolCodeChanged = resolvedSchoolCode !== undefined && resolvedSchoolCode !== existing?.school_code;

  const updatePayload: Record<string, any> = {
    ...rest,
    branding,
    country: resolvedCountry,
  };

  delete updatePayload.status;

  if (resolvedSchoolCode !== undefined)     updatePayload.school_code            = resolvedSchoolCode;
  if (patchConsultantId !== undefined)      updatePayload.consultant_id          = patchConsultantId || null;
  if (discount_code)                        updatePayload.discount_code          = discount_code.toUpperCase();
  if (address !== undefined)                updatePayload.address                = address || null;
  if (pin_code !== undefined)               updatePayload.pin_code               = pin_code || null;
  if (contact_persons !== undefined)        updatePayload.contact_persons        = contact_persons ?? [];
  if (is_registration_active !== undefined) updatePayload.is_registration_active = !!is_registration_active;

  // Keep the registration redirect URL in sync whenever the program and/or
  // school code changes (the URL is built from both).
  const effectiveSchoolCode = resolvedSchoolCode ?? existing?.school_code;

  if (project_id) {
    const { data: program } = await service
      .from('projects')
      .select('slug, base_url')
      .eq('id', project_id)
      .single();
    if (program) {
      updatePayload.project_id   = project_id;
      updatePayload.project_slug = program.slug;
      branding.redirectURL = effectiveSchoolCode
        ? `https://thynksuccess.com/registration/${program.slug}/?school=${effectiveSchoolCode}`
        : `https://thynksuccess.com/registration/${program.slug}`;
      updatePayload.branding = branding;
    }
  } else if (schoolCodeChanged && existing?.project_slug) {
    branding.redirectURL = `https://thynksuccess.com/registration/${existing.project_slug}/?school=${effectiveSchoolCode}`;
    updatePayload.branding = branding;
  }

  const { data, error } = await service
    .from('schools')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    const message = error.code === '23505' ? 'School code already exists' : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (school_price !== undefined) {
    await service.from('pricing')
      .update({ base_amount: Math.round(Number(school_price)), currency: resolvedCurrency })
      .eq('school_id', id)
      .eq('is_active', true);
  }

  // grade_specific_pricing === false  → explicitly clear grade prices (revert to flat)
  // grade_specific_pricing === true   → save whatever grade_prices_inr/usd were sent
  // grade_specific_pricing === undefined → don't touch grade pricing at all
  if (grade_specific_pricing !== undefined) {
    await service.from('pricing')
      .update({
        grade_prices_inr: grade_specific_pricing ? (bodyGradePricesInr ?? null) : null,
        grade_prices_usd: grade_specific_pricing ? (bodyGradePricesUsd ?? null) : null,
      })
      .eq('school_id', id)
      .eq('is_active', true);
  }

  if (discount_code && existing?.discount_code) {
    await service.from('discount_codes')
      .update({ code: discount_code.toUpperCase() })
      .eq('school_id', id)
      .eq('code', existing.discount_code);
  }

  return NextResponse.json({ school: data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // ── Guard: block deletion if the school has any student registrations or payments ──
  const [{ count: regCount }, { count: paymentCount }] = await Promise.all([
    service.from('registrations').select('id', { count: 'exact', head: true }).eq('school_id', id),
    service.from('payments').select('id', { count: 'exact', head: true }).eq('school_id', id),
  ]);

  if ((regCount ?? 0) > 0 || (paymentCount ?? 0) > 0) {
    const parts: string[] = [];
    if ((regCount ?? 0) > 0) parts.push(`${regCount} student registration${regCount === 1 ? '' : 's'}`);
    if ((paymentCount ?? 0) > 0) parts.push(`${paymentCount} payment record${paymentCount === 1 ? '' : 's'}`);
    return NextResponse.json(
      {
        error: `Cannot delete this school — it has ${parts.join(' and ')} associated with it. Remove or reassign those records first.`,
        blocked: true,
        registration_count: regCount ?? 0,
        payment_count: paymentCount ?? 0,
      },
      { status: 409 }
    );
  }

  const { error } = await service.from('schools').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
