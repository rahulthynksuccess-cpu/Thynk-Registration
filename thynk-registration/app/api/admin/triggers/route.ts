import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

const CONSULTANT_EVENTS = ['consultant.registered', 'consultant.approved'];

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

// Only columns that exist on notification_triggers.
// recipient_type added in migration 006.
function sanitizeTrigger(raw: Record<string, any>) {
  const { event_type, channel, template_id, school_id, is_active, recipient_type } = raw;

  // Consultant events are always global (no school_id) and recipient is consultant
  const isConsultantEvent = CONSULTANT_EVENTS.includes(event_type);

  return {
    event_type,
    channel,
    template_id,
    school_id:      isConsultantEvent ? null : (school_id ?? null),
    is_active:      is_active ?? true,
    recipient_type: recipient_type ?? (isConsultantEvent ? 'consultant' : 'student'),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');

  let query = service
    .from('notification_triggers')
    .select('*, notification_templates(id, name, channel)')
    .order('created_at', { ascending: false });

  if (schoolId) {
    // Specific school requested — return that school's triggers + global consultant triggers
    query = query.or(`school_id.eq.${schoolId},event_type.in.(${CONSULTANT_EVENTS.map(e => `"${e}"`).join(',')})`);
  } else if (auth.role.role !== 'super_admin') {
    // Non-super-admin — show their school's triggers + global consultant triggers
    query = query.or(`school_id.eq.${auth.role.school_id},school_id.is.null`);
  }
  // super_admin with no schoolId filter → return everything (no extra filter)

  const { data } = await query;
  return NextResponse.json({ triggers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const body = await req.json();
  const { data, error } = await service
    .from('notification_triggers')
    .insert(sanitizeTrigger(body))
    .select('*, notification_templates(id, name, channel)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ trigger: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id, ...rest } = await req.json();
  const { data, error } = await service
    .from('notification_triggers')
    .update(sanitizeTrigger(rest))
    .eq('id', id)
    .select('*, notification_templates(id, name, channel)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ trigger: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const service = createServiceClient();
  const { id } = await req.json();
  await service.from('notification_triggers').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
