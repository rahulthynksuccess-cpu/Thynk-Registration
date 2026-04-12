// app/api/admin/schools/approve/route.ts
// Super admin only — approve or reject a school registration
// PATCH { id, action: 'approve'|'reject', school_code?, pricing_amount? }

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

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const body = await req.json();
  const { id, action, school_code, pricing_amount } = body;

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
  }
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  // Fetch school with project info
  const { data: school, error: fetchErr } = await service
    .from('schools')
    .select('*, projects(name, slug, base_url, base_amount_inr, base_amount_usd)')
    .eq('id', id)
    .single();

  if (fetchErr || !school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // ── REJECT ────────────────────────────────────────────────────
  if (action === 'reject') {
    await service
      .from('schools')
      .update({ status: 'registered', is_active: false, is_registration_active: false })
      .eq('id', id);

    void service.from('activity_logs').insert({
      user_id:     user.id,
      school_id:   id,
      action:      'school.rejected',
      entity_type: 'school',
      entity_id:   id,
      metadata:    { rejected_by: user.email },
    });

    return NextResponse.json({ success: true, action: 'rejected' });
  }

  // ── APPROVE ───────────────────────────────────────────────────
  if (!school_code?.trim()) {
    return NextResponse.json({ error: 'school_code is required to approve' }, { status: 400 });
  }

  const code        = school_code.toLowerCase().replace(/\s+/g, '-');
  const country     = school.country || 'India';
  const currency    = currencyForCountry(country);
  const project     = (school as any).projects;
  const baseUrl     = project?.base_url || 'https://www.thynksuccess.com';
  const slug        = school.project_slug || project?.slug || '';
  const redirectURL = `${baseUrl}/registration/${slug}/${code}`;
  const discCode    = code.toUpperCase();

  // Check school_code uniqueness
  const { data: codeConflict } = await service
    .from('schools')
    .select('id')
    .eq('school_code', code)
    .neq('id', id)
    .maybeSingle();

  if (codeConflict) {
    return NextResponse.json(
      { error: 'School code already in use by another school' },
      { status: 409 }
    );
  }

  // Determine pricing amount (explicit → program base → 0)
  let pricingAmount = pricing_amount ? Math.round(Number(pricing_amount)) : 0;
  if (!pricingAmount && project) {
    pricingAmount = currency === 'INR'
      ? (project.base_amount_inr || 0)
      : (project.base_amount_usd || 0);
  }

  // Update school
  const { data: updated, error: updateErr } = await service
    .from('schools')
    .update({
      school_code:            code,
      status:                 'approved',
      is_active:              true,
      is_registration_active: true,
      approved_at:            new Date().toISOString(),
      approved_by:            user.id,
      discount_code:          discCode,
      branding: {
        ...(school.branding || {}),
        primaryColor: school.branding?.primaryColor || '#4f46e5',
        accentColor:  school.branding?.accentColor  || '#8b5cf6',
        redirectURL,
      },
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Create or update pricing
  const { data: existingPricing } = await service
    .from('pricing')
    .select('id')
    .eq('school_id', id)
    .eq('is_active', true)
    .maybeSingle();

  const gatewaySeq = currency === 'INR'
    ? ['cashfree', 'razorpay', 'easebuzz']
    : ['paypal', 'razorpay'];

  if (existingPricing) {
    await service
      .from('pricing')
      .update({ base_amount: pricingAmount, currency, gateway_sequence: gatewaySeq })
      .eq('id', existingPricing.id);
  } else {
    await service.from('pricing').insert({
      school_id:        id,
      program_name:     project?.name || school.name,
      base_amount:      pricingAmount,
      currency,
      gateway_sequence: gatewaySeq,
      is_active:        true,
    });
  }

  // Create default discount code (0 discount — admin edits in Discount Codes tab)
  void service.from('discount_codes').upsert(
    {
      school_id:       id,
      code:            discCode,
      discount_amount: 0,
      is_active:       true,
      max_uses:        null,
    },
    { onConflict: 'school_id,code', ignoreDuplicates: true }
  );

  // Activity log
  void service.from('activity_logs').insert({
    user_id:     user.id,
    school_id:   id,
    action:      'school.approved',
    entity_type: 'school',
    entity_id:   id,
    metadata: {
      school_code: code,
      pricing:     pricingAmount,
      currency,
      approved_by: user.email,
      reg_url:     redirectURL,
    },
  });

  return NextResponse.json({
    success: true,
    action:  'approved',
    school:  updated,
    reg_url: redirectURL,
  });
}
