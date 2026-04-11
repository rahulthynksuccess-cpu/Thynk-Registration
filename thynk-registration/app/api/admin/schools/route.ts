import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: schools } = await service
    .from('schools')
    .select(`id, school_code, name, org_name, logo_url, branding, gateway_config, is_active,
             city, state, country, project_id, project_slug, created_at,
             pricing (id, program_name, base_amount, currency, gateway_sequence, is_active)`)
    .order('created_at', { ascending: false });
  return NextResponse.json({ schools: schools ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { school_code, name, org_name, city, state, country,
          project_id, school_price, currency,
          primary_color, accent_color, is_active } = body;

  if (!school_code || !name || !org_name || !project_id || !school_price)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  // Get program details for redirect URL and project_slug
  const { data: program } = await service.from('projects').select('slug, name').eq('id', project_id).single();
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 400 });

  const code = school_code.toLowerCase().replace(/\s+/g, '-');
  const redirectURL = `https://www.thynksuccess.com/registration/${program.slug}/${code}`;

  const { data: school, error } = await service.from('schools').insert({
    school_code: code,
    name, org_name,
    city: city || null,
    state: state || null,
    country: country || 'India',
    project_id,
    project_slug: program.slug,
    branding: {
      primaryColor: primary_color || '#4f46e5',
      accentColor:  accent_color  || '#8b5cf6',
      redirectURL,
    },
    gateway_config: {},
    is_active: is_active !== false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.code === '23505' ? 'School code already exists' : error.message }, { status: 400 });

  // Create pricing
  await service.from('pricing').insert({
    school_id: school.id,
    program_name: program.name,
    base_amount: Math.round(Number(school_price)),
    currency: currency || 'INR',
    gateway_sequence: ['cashfree', 'razorpay', 'easebuzz'],
    is_active: true,
  });

  // Auto-create default discount code from school code
  await service.from('discount_codes').insert({
    school_id: school.id,
    code: code.toUpperCase(),
    discount_amount: 0,  // 0 discount by default — admin can edit
    is_active: true,
    max_uses: null,
  });

  return NextResponse.json({ school }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { id, school_price, currency, primary_color, accent_color, project_id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Build branding update
  const { data: existing } = await service.from('schools').select('branding, project_slug').eq('id', id).single();
  let branding = existing?.branding ?? {};
  if (primary_color) branding = { ...branding, primaryColor: primary_color };
  if (accent_color)  branding = { ...branding, accentColor: accent_color };

  let updatePayload: Record<string, any> = { ...rest, branding };
  if (project_id) {
    const { data: program } = await service.from('projects').select('slug').eq('id', project_id).single();
    if (program) { updatePayload.project_id = project_id; updatePayload.project_slug = program.slug; }
  }

  const { data, error } = await service.from('schools').update(updatePayload).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Update pricing if school_price provided
  if (school_price) {
    await service.from('pricing').update({ base_amount: Math.round(Number(school_price)), currency: currency||'INR' }).eq('school_id', id).eq('is_active', true);
  }

  return NextResponse.json({ school: data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('schools').update({ is_active: false }).eq('id', id);
  return NextResponse.json({ success: true });
}
