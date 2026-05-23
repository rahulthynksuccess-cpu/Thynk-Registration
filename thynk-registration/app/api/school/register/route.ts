// app/api/schools/register/route.ts
// Public endpoint — no auth required
// Schools self-register here; status = 'registered', inactive until approved by admin
//
// consultant_code (optional body field):
//   - If present → look up consultant and tag school with their user_id
//   - If absent  → fall back to the default consultant (is_default_consultant = true)
//   - If no default exists → consultant_id remains null

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fireTriggers } from '@/lib/triggers/fire';

function currencyForCountry(country: string): string {
  return (country || '').toLowerCase() === 'india' ? 'INR' : 'USD';
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    name,
    org_name,
    address,
    country,
    state,
    city,
    pin_code,
    contact_persons,
    project_id,
    project_slug,
    consultant_code, // optional — present when school registers via curated link
  } = body;

  // ── Validation ─────────────────────────────────────────────────
  const missing: string[] = [];
  if (!name?.trim())     missing.push('name');
  if (!address?.trim())  missing.push('address');
  if (!country?.trim())  missing.push('country');
  if (!state?.trim())    missing.push('state');
  if (!city?.trim())     missing.push('city');
  if (!pin_code?.trim()) missing.push('pin_code');

  const contacts: any[] = Array.isArray(contact_persons) ? contact_persons : [];
  const primaryContact = contacts[0];
  if (!primaryContact?.name?.trim())   missing.push('contact_persons[0].name');
  if (!primaryContact?.mobile?.trim()) missing.push('contact_persons[0].mobile');
  if (!project_id && !project_slug)    missing.push('project_id or project_slug');

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  // ── Resolve project ────────────────────────────────────────────
  let project: any;
  if (project_id) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, slug, status, base_url')
      .eq('id', project_id)
      .single();
    project = data;
  } else if (project_slug) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, slug, status, base_url')
      .eq('slug', project_slug)
      .single();
    project = data;
  }

  if (!project) {
    return NextResponse.json({ error: 'Program not found' }, { status: 400 });
  }

  if (project.status !== 'active') {
    return NextResponse.json(
      { error: 'This program is not currently accepting school registrations.' },
      { status: 403 }
    );
  }

  // ── Resolve consultant_id ──────────────────────────────────────
  // Priority: curated link code → default consultant → null
  let resolvedConsultantId: string | null = null;

  if (consultant_code?.trim()) {
    const code = consultant_code.trim().toLowerCase();
    const { data: profile } = await supabase
      .from('consultant_profiles')
      .select('user_id')
      .eq('consultant_code', code)
      .maybeSingle();
    resolvedConsultantId = profile?.user_id ?? null;
  }

  if (!resolvedConsultantId) {
    // Fall back to default consultant
    const { data: defaultProfile } = await supabase
      .from('consultant_profiles')
      .select('user_id')
      .eq('is_default_consultant', true)
      .maybeSingle();
    resolvedConsultantId = defaultProfile?.user_id ?? null;
  }

  // ── Duplicate check (same school name + project) ───────────────
  const { data: existing } = await supabase
    .from('schools')
    .select('id, status')
    .eq('name', name.trim())
    .eq('project_id', project.id)
    .maybeSingle();

  if (existing) {
    const statusMsg =
      existing.status === 'approved'
        ? 'Your school is already registered and approved.'
        : existing.status === 'pending_approval'
        ? 'Your school registration is already submitted and awaiting approval.'
        : 'Your school is already registered. Please wait for admin approval.';
    return NextResponse.json({ error: statusMsg, already_registered: true }, { status: 409 });
  }

  // ── Insert school ──────────────────────────────────────────────
  const { data: school, error } = await supabase
    .from('schools')
    .insert({
      school_code:            `pending-${Date.now()}`,
      name:                   name.trim(),
      org_name:               (org_name || name).trim(),
      address:                address.trim(),
      country:                country.trim(),
      state:                  state.trim(),
      city:                   city.trim(),
      pin_code:               pin_code.trim(),
      contact_persons:        contacts,
      project_id:             project.id,
      project_slug:           project.slug,
      consultant_id:          resolvedConsultantId,
      status:                 'registered',
      is_active:              false,
      is_registration_active: false,
      branding: {
        primaryColor: '#4f46e5',
        accentColor:  '#8b5cf6',
        redirectURL:  '',
      },
      gateway_config: {},
    })
    .select('id, name, status, city, country, created_at, consultant_id')
    .single();

  if (error) {
    console.error('School self-registration error:', error);
    return NextResponse.json({ error: 'Failed to submit registration. Please try again.' }, { status: 500 });
  }

  // ── Activity log ───────────────────────────────────────────────
  void supabase.from('activity_logs').insert({
    school_id:   school.id,
    action:      'school.self_registered',
    entity_type: 'school',
    entity_id:   school.id,
    metadata: {
      name:             school.name,
      city:             school.city,
      country:          school.country,
      project_id:       project.id,
      project_name:     project.name,
      consultant_id:    resolvedConsultantId,
      via_curated_link: !!consultant_code?.trim(),
      contact_email:    primaryContact?.email ?? null,
    },
  });

  // ── Fire school.registered trigger ────────────────────────────
  await fireTriggers('school.registered', '', school.id);

  return NextResponse.json(
    {
      success: true,
      message:
        'School registration submitted successfully. You will be notified once approved by our team.',
      school: {
        id:     school.id,
        name:   school.name,
        status: school.status,
      },
    },
    { status: 201 }
  );
}
