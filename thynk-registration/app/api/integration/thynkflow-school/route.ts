// app/api/integration/thynkflow-school/route.ts
// Server-to-server endpoint — NOT user-authenticated. Called by ThynkFlow's
// backend when a consultant taps "Create School" on a Converted lead.
//
// Auth: header `x-api-key`, checked against integration_configs where
// provider = 'thynkflow_crm', school_id is null. Generate/rotate that key
// from Admin → Integrations → ThynkFlow CRM.
//
// Deliberately lenient on required fields (see [chat] decision: partial
// data now, completed inside Registration later) — only name, project_id,
// and consultant_id are required. Everything else is filled in by the
// consultant/admin from Registration's normal school-edit screens before
// the same approval flow (`/api/admin/schools/approve`) runs.
//
// Inserts with status = 'registered' — identical to the existing public
// self-registration path (`/api/school/register`) — so it lands in the
// same approval queue and needs no new admin screen.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fireTriggers } from '@/lib/triggers/fire';

async function checkApiKey(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-api-key');
  if (!key) return false;
  const service = createServiceClient();
  const { data, error } = await service
    .from('integration_configs')
    .select('config')
    .eq('provider', 'thynkflow_crm')
    .is('school_id', null)
    .maybeSingle();
  if (error) throw new Error(`Could not look up API key: ${error.message}`);
  const storedKey = (data?.config as any)?.api_key;
  return !!storedKey && storedKey === key;
}

export async function POST(req: NextRequest) {
  // Everything below is wrapped so a failure anywhere (missing env var,
  // Supabase hiccup, unexpected input) always comes back as JSON —
  // never Vercel's generic HTML crash page — so the real cause is visible
  // in ThynkFlow's error message instead of a confusing HTML parse error.
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: Supabase env vars are missing on this deployment.' }, { status: 500 });
    }

    const authorized = await checkApiKey(req);
    if (!authorized) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });

    const service = createServiceClient();

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
      consultant_id,
      source_system,
      source_lead_id,
    } = body;

    // ── Minimal validation — deliberately lenient, rest completed in Registration ──
    const missing: string[] = [];
    if (!name?.toString().trim())        missing.push('name');
    if (!project_id)                     missing.push('project_id');
    if (!consultant_id)                  missing.push('consultant_id');
    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
    }

    // ── Idempotency — a lead can only ever create one school ────────────
    if (source_lead_id) {
      const { data: existing, error: existingErr } = await service
        .from('schools')
        .select('id, name, status, school_code')
        .eq('source_system', source_system || 'thynkflow')
        .eq('source_lead_id', String(source_lead_id))
        .maybeSingle();
      if (existingErr) return NextResponse.json({ error: `Idempotency check failed: ${existingErr.message}` }, { status: 500 });
      if (existing) {
        return NextResponse.json({
          success: true,
          already_existed: true,
          school: { id: existing.id, name: existing.name, status: existing.status, school_code: existing.school_code },
        }, { status: 200 });
      }
    }

    // ── Resolve project ──────────────────────────────────────────────
    const { data: project, error: projectErr } = await service
      .from('projects')
      .select('id, name, slug, status')
      .eq('id', project_id)
      .single();
    if (projectErr || !project) return NextResponse.json({ error: `Program not found for the given project_id (${projectErr?.message || 'no match'})` }, { status: 400 });

    // ── Resolve consultant — must actually be a consultant in Registration ──
    const { data: consultantRole, error: consultantErr } = await service
      .from('admin_roles')
      .select('id')
      .eq('user_id', consultant_id)
      .eq('role', 'consultant')
      .maybeSingle();
    if (consultantErr) return NextResponse.json({ error: `Consultant lookup failed: ${consultantErr.message}` }, { status: 500 });
    if (!consultantRole) {
      return NextResponse.json({ error: 'consultant_id is not a valid Registration consultant. Check the mapping in ThynkFlow → Settings → Registration Sync.' }, { status: 400 });
    }

    const contacts: any[] = Array.isArray(contact_persons) ? contact_persons : [];

    // ── Insert school with status = 'registered' — same pending state ──
    // ── self-registered schools land in, so the existing approval queue ──
    // ── (/api/admin/schools/approve) picks it up with no changes needed ──
    const { data: school, error } = await service
      .from('schools')
      .insert({
        school_code:            `tf-pending-${Date.now()}`,
        name:                   name.toString().trim(),
        org_name:               (org_name || name).toString().trim(),
        address:                address?.toString().trim() || null,
        country:                country?.toString().trim() || 'India',
        state:                  state?.toString().trim() || null,
        city:                   city?.toString().trim() || null,
        pin_code:               pin_code?.toString().trim() || null,
        contact_persons:        contacts,
        project_id:             project.id,
        project_slug:           project.slug,
        consultant_id,
        status:                 'registered',
        is_active:              false,
        is_registration_active: false,
        source_system:          source_system || 'thynkflow',
        source_lead_id:         source_lead_id ? String(source_lead_id) : null,
        branding: {
          primaryColor: '#4f46e5',
          accentColor:  '#8b5cf6',
          redirectURL:  '',
        },
        gateway_config: {},
      })
      .select('id, name, status, school_code, created_at')
      .single();

    if (error) {
      console.error('ThynkFlow → Registration school creation error:', error);
      return NextResponse.json({ error: error.message || 'Failed to create school' }, { status: 500 });
    }

    void service.from('activity_logs').insert({
      school_id:   school.id,
      action:      'school.created_from_thynkflow',
      entity_type: 'school',
      entity_id:   school.id,
      metadata:    { source_lead_id: source_lead_id || null, project_id: project.id, project_name: project.name, consultant_id },
    });

    // Same trigger self-registration fires (school-contact confirmation + admin alert)
    await fireTriggers('school.registered', '', school.id).catch(() => {});

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thynksuccess.com';

    return NextResponse.json(
      {
        success: true,
        school: { id: school.id, name: school.name, status: school.status, school_code: school.school_code },
        admin_url: `${baseUrl}/admin/schools?status=registered&highlight=${school.id}`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('thynkflow-school route crashed:', err);
    return NextResponse.json({ error: `Unexpected server error: ${err?.message || String(err)}` }, { status: 500 });
  }
}
