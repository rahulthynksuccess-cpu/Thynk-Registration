// app/api/consultant/register/route.ts
// PUBLIC — no auth required. Accepts self-registration from the embeddable HTML form.
// Saves to consultant_registrations table with status = 'pending'

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fireConsultantTriggers } from '@/lib/triggers/fire';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Pre-flight CORS for WordPress iframe embeds
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      full_name,
      contact_number,
      contact_email,
      location,
      total_exp_years,
      domain_expertise,
      locations_worked,
      has_edu_connections,
      has_b2b_exp,
      has_b2c_exp,
      detailed_intro,
      experience_summary,
    } = body;

    // Basic validation
    if (!full_name?.trim())
      return NextResponse.json({ error: 'Full name is required' }, { status: 400, headers: CORS });
    if (!contact_number?.trim())
      return NextResponse.json({ error: 'Contact number is required' }, { status: 400, headers: CORS });
    if (!contact_email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email))
      return NextResponse.json({ error: 'Valid contact email is required' }, { status: 400, headers: CORS });

    const service = createServiceClient();

    // Prevent duplicate PENDING submissions for same email
    // But allow re-registration if a previous request was approved but no consultant profile exists
    // (handles case where user is sub_admin + wants to also be consultant)
    const { data: existing } = await service
      .from('consultant_registrations')
      .select('id, status, consultant_user_id')
      .eq('contact_email', contact_email.trim().toLowerCase())
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === 'pending') {
      return NextResponse.json({ error: 'A registration request for this email is already pending review.' }, { status: 409, headers: CORS });
    }

    if (existing?.status === 'approved' && existing.consultant_user_id) {
      // Check if they actually have a consultant profile — if yes, truly already registered
      const { data: profile } = await service
        .from('consultant_profiles')
        .select('id')
        .eq('user_id', existing.consultant_user_id)
        .maybeSingle();
      if (profile) {
        return NextResponse.json({ error: 'This email is already registered as a consultant.' }, { status: 409, headers: CORS });
      }
      // No profile yet despite being 'approved' — allow re-submission
    }

    const { data, error } = await service
      .from('consultant_registrations')
      .insert({
        full_name:           full_name.trim(),
        contact_number:      contact_number.trim(),
        contact_email:       contact_email.trim().toLowerCase(),
        location:            location?.trim() || null,
        total_exp_years:     total_exp_years ? Number(total_exp_years) : null,
        domain_expertise:    Array.isArray(domain_expertise) ? domain_expertise : [],
        locations_worked:    locations_worked?.trim() || null,
        has_edu_connections: has_edu_connections === true || has_edu_connections === 'true',
        has_b2b_exp:         has_b2b_exp === true || has_b2b_exp === 'true',
        has_b2c_exp:         has_b2c_exp === true || has_b2c_exp === 'true',
        detailed_intro:      detailed_intro?.trim() || null,
        experience_summary:  experience_summary?.trim() || null,
        status:              'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[consultant/register] DB error:', error);
      return NextResponse.json({ error: 'Failed to submit registration. Please try again.' }, { status: 500, headers: CORS });
    }

    // Fire auto-email/WhatsApp trigger (consultant.registered)
    // Awaited so Vercel doesn't kill it before it completes
    await fireConsultantTriggers('consultant.registered', data.id);

    return NextResponse.json({ success: true, id: data.id }, { status: 201, headers: CORS });

  } catch (err: any) {
    console.error('[consultant/register] Unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: CORS });
  }
}
