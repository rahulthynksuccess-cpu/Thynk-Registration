import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

/** GET /api/admin/location
 *  ?type=countries           → distinct countries
 *  ?type=states&country=India → distinct states in country
 *  ?type=cities&country=India&state=Delhi → cities in state
 *  ?type=all&includeInactive=true → full flat list (admin use)
 */
export async function GET(req: NextRequest) {
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const type            = searchParams.get('type') ?? 'all';
  const country         = searchParams.get('country');
  const state           = searchParams.get('state');
  const includeInactive = searchParams.get('includeInactive') === 'true';

  let query = service
    .from('location_master')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('city', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  if (type === 'countries') {
    const { data } = await service
      .from('location_master')
      .select('country')
      .eq('is_active', true);
    const countries = [...new Set((data ?? []).map((r: any) => r.country))].sort();
    return NextResponse.json({ countries });
  }

  if (type === 'states' && country) {
    const { data } = await service
      .from('location_master')
      .select('state')
      .eq('country', country)
      .eq('is_active', true);
    const states = [...new Set((data ?? []).map((r: any) => r.state))].sort();
    return NextResponse.json({ states });
  }

  if (type === 'cities' && country && state) {
    const { data } = await service
      .from('location_master')
      .select('city')
      .eq('country', country)
      .eq('state', state)
      .eq('is_active', true)
      .not('city', 'is', null);
    const cities = (data ?? []).map((r: any) => r.city).filter(Boolean).sort();
    return NextResponse.json({ cities });
  }

  // Full list for admin settings page
  const { data } = await query;
  return NextResponse.json({ locations: data ?? [] });
}

/** POST — add a new location entry */
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { country, state, city, sort_order } = await req.json();

  if (!country || !state)
    return NextResponse.json({ error: 'country and state are required' }, { status: 400 });

  const { data, error } = await service.from('location_master').insert({
    country,
    state,
    city: city || null,
    sort_order: sort_order ?? 0,
    is_active: true,
  }).select().single();

  if (error)
    return NextResponse.json(
      { error: error.code === '23505' ? 'Location already exists' : error.message },
      { status: 400 }
    );

  return NextResponse.json({ location: data }, { status: 201 });
}

/** PATCH — toggle active or update */
export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await service
    .from('location_master')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ location: data });
}

/** DELETE */
export async function DELETE(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('location_master').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
