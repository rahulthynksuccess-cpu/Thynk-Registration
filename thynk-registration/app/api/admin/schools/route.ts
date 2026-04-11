import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data: schools } = await service
    .from('schools')
    .select(`id, school_code, name, org_name, logo_url, branding, gateway_config, is_active, created_at,
      pricing (id, program_name, base_amount, currency, gateway_sequence, is_active)`)
    .order('created_at', { ascending: false });
  return NextResponse.json({ schools: schools ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { school_code, name, org_name, logo_url, primary_color, accent_color, redirect_url,
          program_name, base_amount, currency, gateway_sequence,
          rzp_key_id, cf_mode, eb_env } = body;

  if (!school_code || !name || !org_name || !program_name || !base_amount)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const { data: school, error } = await service.from('schools').insert({
    school_code: school_code.toLowerCase().replace(/\s+/g, '-'),
    name, org_name,
    logo_url: logo_url || null,
    branding: {
      primaryColor: primary_color || '#4f46e5',
      accentColor:  accent_color  || '#8b5cf6',
      redirectURL:  redirect_url  || 'https://www.thynksuccess.com',
    },
    gateway_config: { rzp_key_id: rzp_key_id || null, cf_mode: cf_mode || 'production', eb_env: eb_env || 'production' },
    is_active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.code === '23505' ? 'School code already exists' : error.message }, { status: 400 });

  await service.from('pricing').insert({
    school_id: school.id,
    program_name,
    base_amount: Math.round(Number(base_amount) * 100),
    currency: currency || 'INR',
    gateway_sequence: gateway_sequence || ['cf','rzp','eb'],
    is_active: true,
  });

  return NextResponse.json({ school }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { data, error } = await service.from('schools').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
