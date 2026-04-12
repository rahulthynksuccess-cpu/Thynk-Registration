import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Verify caller is super admin
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: role } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .is('school_id', null)
    .single();

  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    school_code, name, org_name, logo_url,
    branding, gateway_config,
    program_name, base_amount, currency, gateway_sequence,
  } = body;

  if (!school_code || !name || !org_name || !program_name || !base_amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Insert school
  const { data: school, error: schoolErr } = await service
    .from('schools')
    .insert({
      school_code: school_code.toLowerCase().replace(/\s+/g, ''),
      name, org_name,
      logo_url: logo_url ?? null,
      branding:        branding        ?? {},
      gateway_config:  gateway_config  ?? {},
      is_active: true,
    })
    .select()
    .single();

  if (schoolErr) {
    if (schoolErr.code === '23505') {
      return NextResponse.json({ error: 'School code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  // Insert pricing
  await service.from('pricing').insert({
    school_id: school.id,
    program_name,
    base_amount: Math.round(Number(base_amount) * 100), // convert to paise
    currency: currency ?? 'INR',
    gateway_sequence: gateway_sequence ?? ['cf','rzp','eb'],
    is_active: true,
  });

  return NextResponse.json({ school }, { status: 201 });
}

export async function GET(req: NextRequest) {
  // List all schools (super admin only)
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: schools } = await service
    .from('schools')
    .select('id, school_code, name, org_name, is_active, created_at, pricing(program_name, base_amount, currency)')
    .order('created_at', { ascending: false });

  return NextResponse.json({ schools: schools ?? [] });
}
