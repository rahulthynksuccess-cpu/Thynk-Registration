// app/api/admin/consultant-registrations/route.ts
// Super-admin CRUD for the consultant_registrations pending queue.
//
// GET  → list registrations (filter by ?status=pending|approved|rejected)
// PATCH { id, action:'approve'|'reject', reject_reason? }
//   approve: auto-creates auth user, assigns consultant role, generates next code
//   reject:  marks as rejected with optional reason

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { fireConsultantTriggers } from '@/lib/triggers/fire';

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

// ── GET /api/admin/consultant-registrations ───────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';

  let query = service
    .from('consultant_registrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ registrations: data ?? [] });
}

// ── PATCH /api/admin/consultant-registrations ─────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const body = await req.json();
  const { id, action, reject_reason } = body;

  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  if (!['approve', 'reject'].includes(action))
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });

  // Fetch the registration
  const { data: reg, error: regErr } = await service
    .from('consultant_registrations')
    .select('*')
    .eq('id', id)
    .single();

  if (regErr || !reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  if (reg.status !== 'pending')
    return NextResponse.json({ error: `Registration is already ${reg.status}` }, { status: 409 });

  // ── REJECT ──────────────────────────────────────────────────────────────────
  if (action === 'reject') {
    await service
      .from('consultant_registrations')
      .update({
        status:        'rejected',
        reviewed_at:   new Date().toISOString(),
        reviewed_by:   user.id,
        reject_reason: reject_reason?.trim() || null,
      })
      .eq('id', id);

    return NextResponse.json({ success: true, action: 'rejected' });
  }

  // ── APPROVE ─────────────────────────────────────────────────────────────────

  // 1. Get next consultant code by incrementing the sequence
  const { data: seqRow, error: seqErr } = await service
    .from('consultant_code_seq')
    .select('last_num')
    .eq('id', 1)
    .single();

  if (seqErr || !seqRow)
    return NextResponse.json({ error: 'Could not fetch code sequence' }, { status: 500 });

  const nextNum  = seqRow.last_num + 1;
  const consCode = `tscons${nextNum}`;

  // 2. Check code uniqueness (safety net)
  const { data: codeConflict } = await service
    .from('consultant_profiles')
    .select('id')
    .eq('consultant_code', consCode)
    .maybeSingle();

  if (codeConflict) {
    // Increment further if conflict (edge case)
    return NextResponse.json({ error: 'Code conflict, please retry' }, { status: 409 });
  }

  // 3. Create auth user — or reuse if already exists
  let userId: string;

  const { data: newUser, error: authErr } = await service.auth.admin.createUser({
    email:         reg.contact_email,
    password:      'Thynk@1234',
    email_confirm: true,
    user_metadata: { name: reg.full_name },
  });

  if (authErr) {
    if (authErr.message.toLowerCase().includes('already')) {
      // User exists in auth — look them up and reuse
      const { data: existingUsers, error: listErr } = await service.auth.admin.listUsers();
      if (listErr) return NextResponse.json({ error: 'Could not look up existing user' }, { status: 500 });

      const existingUser = (existingUsers.users as { id: string; email?: string }[])
        .find(u => u.email === reg.contact_email);
      if (!existingUser) return NextResponse.json({ error: 'User lookup failed' }, { status: 500 });

      userId = existingUser.id;

      // Check if already a consultant
      const { data: existingProfile } = await service
        .from('consultant_profiles')
        .select('id, consultant_code')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingProfile) {
        // Already a consultant — just mark registration approved and link it
        await service
          .from('consultant_registrations')
          .update({
            status:             'approved',
            reviewed_at:        new Date().toISOString(),
            reviewed_by:        user.id,
            consultant_user_id: userId,
            consultant_code:    existingProfile.consultant_code,
          })
          .eq('id', id);

        return NextResponse.json({
          success:         true,
          action:          'approved',
          note:            'Linked to existing consultant account',
          consultant_code: existingProfile.consultant_code,
          user_id:         userId,
          email:           reg.contact_email,
        });
      }
      // Exists in auth but not yet a consultant — continue with role + profile creation below
    } else {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }
  } else {
    userId = newUser.user.id;
  }

  // userId is now set above (either new or existing user)

  // 4. Assign consultant role
  const { error: roleErr } = await service.from('admin_roles').insert({
    user_id:   userId,
    role:      'consultant',
    school_id: null,
  });

  if (roleErr) {
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }

  // 5. Write extended profile
  const { error: profileErr } = await service.from('consultant_profiles').insert({
    user_id:               userId,
    consultant_code:       consCode,
    mobile_number:         reg.contact_number || null,
    // Extended online-reg fields
    full_name:             reg.full_name,
    contact_email:         reg.contact_email,
    contact_number:        reg.contact_number,
    location:              reg.location,
    total_exp_years:       reg.total_exp_years,
    domain_expertise:      reg.domain_expertise,
    locations_worked:      reg.locations_worked,
    has_edu_connections:   reg.has_edu_connections,
    has_b2b_exp:           reg.has_b2b_exp,
    has_b2c_exp:           reg.has_b2c_exp,
    detailed_intro:        reg.detailed_intro,
    experience_summary:    reg.experience_summary,
    is_default_consultant: false,
    registration_source:   'online',
  });

  if (profileErr) {
    await service.from('admin_roles').delete().eq('user_id', userId).eq('role', 'consultant');
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // 6. Increment sequence
  await service
    .from('consultant_code_seq')
    .update({ last_num: nextNum })
    .eq('id', 1);

  // 7. Mark registration as approved
  await service
    .from('consultant_registrations')
    .update({
      status:             'approved',
      reviewed_at:        new Date().toISOString(),
      reviewed_by:        user.id,
      consultant_user_id: userId,
      consultant_code:    consCode,
    })
    .eq('id', id);

  // 8. Activity log
  void service.from('activity_logs').insert({
    user_id:     user.id,
    action:      'consultant.approved_from_registration',
    entity_type: 'consultant',
    entity_id:   userId,
    metadata: {
      registration_id:   id,
      consultant_code:   consCode,
      email:             reg.contact_email,
      approved_by:       user.email,
    },
  });

  // 9. Fire auto-email/WhatsApp trigger (consultant.approved)
  await fireConsultantTriggers('consultant.approved', id, userId, consCode);

  return NextResponse.json({
    success:          true,
    action:           'approved',
    consultant_code:  consCode,
    user_id:          userId,
    email:            reg.contact_email,
    default_password: 'Thynk@1234',
  });
}

// ── DELETE /api/admin/consultant-registrations ────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await service.from('consultant_registrations').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
