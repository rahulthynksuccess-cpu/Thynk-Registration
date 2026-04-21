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

function currencyForCountry(country: string): string {
  return (country || '').toLowerCase() === 'india' ? 'INR' : 'USD';
}

export async function GET(req: NextRequest) {
  // Allow both super_admin and sub_admin to fetch schools (sub_admin gets scoped results)
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Determine role and allowed schools
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id, all_schools')
    .eq('user_id', user.id);

  const isSuperAdmin = roleRows?.some(r => r.role === 'super_admin' && !r.school_id);
  const isSubAdmin   = roleRows?.some(r => r.role === 'sub_admin');

  if (!isSuperAdmin && !isSubAdmin) {
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
      project_id, project_slug, discount_code, created_at,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter) as any;
  }

  // Sub-admin: scope to their assigned schools only (unless all_schools = true)
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

  const { data: schools } = await query;
  return NextResponse.json({ schools: schools ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
  } = body;

  if (!school_code || !name || !org_name || !project_id || !school_price)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const resolvedCountry  = country || 'India';
  const resolvedCurrency = bodyCurrency || currencyForCountry(resolvedCountry);

  const { data: program } = await service
    .from('projects')
    .select('slug, name, base_url')
    .eq('id', project_id)
    .single();
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 400 });

  const code        = school_code.toLowerCase().replace(/\s+/g, '-');
  const redirectURL = `https://thynksuccess.com/registration/${program.slug}/?school=${code}`;
  const discCode    = (discount_code || code).toUpperCase();

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
      // Admin-created schools are approved immediately
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

  await service.from('pricing').insert({
    school_id:        school.id,
    program_name:     program.name,
    base_amount:      Math.round(Number(school_price)),
    currency:         resolvedCurrency,
    gateway_sequence: resolvedCurrency === 'INR'
      ? ['cashfree', 'razorpay', 'easebuzz']
      : ['paypal', 'razorpay'],
    is_active: true,
  });

  void service.from('discount_codes').insert({
    school_id:       school.id,
    code:            discCode,
    discount_amount: 0,
    is_active:       true,
    max_uses:        null,
  });

  // ── AUTO-CREATE USERS FOR ALL CONTACT PERSONS ─────────────────
  const contacts: any[] = Array.isArray(contact_persons) ? contact_persons : [];
  const createdUsers: { email: string; status: string }[] = [];

  for (const contact of contacts) {
    const email  = (contact.email  || '').trim();
    const mobile = (contact.mobile || contact.phone || '').trim();

    // Skip if no email — we need email as username
    if (!email) continue;

    // Password = mobile number; fallback to a safe default if missing
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

      // Assign school_admin role linked to this school
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
  // ──────────────────────────────────────────────────────────────

  return NextResponse.json({ school, created_users: createdUsers }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const {
    id,
    school_price,
    currency: bodyCurrency,
    primary_color, accent_color,
    project_id,
    country,
    discount_code,
    address, pin_code, contact_persons,
    is_registration_active,
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

  // Preserve existing status — do not allow PATCH to accidentally reset it
  const updatePayload: Record<string, any> = {
    ...rest,
    branding,
    country: resolvedCountry,
  };

  // Strip status from rest if accidentally passed — PATCH must not change approval status
  delete updatePayload.status;

  if (discount_code)                        updatePayload.discount_code          = discount_code.toUpperCase();
  if (address !== undefined)                updatePayload.address                = address || null;
  if (pin_code !== undefined)               updatePayload.pin_code               = pin_code || null;
  if (contact_persons !== undefined)        updatePayload.contact_persons        = contact_persons ?? [];
  if (is_registration_active !== undefined) updatePayload.is_registration_active = !!is_registration_active;

  if (project_id) {
    const { data: program } = await service
      .from('projects')
      .select('slug, base_url')
      .eq('id', project_id)
      .single();
    if (program) {
      updatePayload.project_id   = project_id;
      updatePayload.project_slug = program.slug;
      branding.redirectURL = existing?.school_code
        ? `https://thynksuccess.com/registration/${program.slug}/?school=${existing.school_code}`
        : `https://thynksuccess.com/registration/${program.slug}`;
      updatePayload.branding = branding;
    }
  }

  const { data, error } = await service
    .from('schools')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (school_price !== undefined) {
    await service.from('pricing')
      .update({ base_amount: Math.round(Number(school_price)), currency: resolvedCurrency })
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
  await service.from('schools').update({ is_active: false }).eq('id', id);
  return NextResponse.json({ success: true });
}
