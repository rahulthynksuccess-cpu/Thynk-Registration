import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

// We store platform settings as a special row in integration_configs
// provider = 'platform_settings', school_id = null (global)
export async function GET() {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { data } = await service
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();
  return NextResponse.json(data?.config ?? {});
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const service = createServiceClient();
  const { error } = await service
    .from('integration_configs')
    .upsert(
      { provider: 'platform_settings', school_id: null, config: body, is_active: true, priority: 0 },
      { onConflict: 'provider,school_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
