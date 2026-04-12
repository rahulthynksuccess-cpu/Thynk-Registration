/**
 * app/api/admin/notification-logs/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/admin/notification-logs
 *
 * Query params (all optional, combinable):
 *   schoolId       — filter by school
 *   registrationId — filter by a specific registration (used by StudentLogPanel)
 *   channel        — 'email' | 'whatsapp'
 *   status         — 'sent' | 'failed' | 'pending'
 *   limit          — max rows (default 200, max 500)
 *
 * Access:
 *   super_admin → all schools
 *   school_admin → only their own school_id
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // ── Determine access scope ──────────────────────────────────────
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, school_id')
    .eq('user_id', user.id);

  const isSuperAdmin     = roleRows?.some(r => r.role === 'super_admin' && !r.school_id);
  const allowedSchoolIds = roleRows?.map(r => r.school_id).filter(Boolean) ?? [];

  // ── Query params ────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const schoolId        = searchParams.get('schoolId');
  const registrationId  = searchParams.get('registrationId');
  const channel         = searchParams.get('channel');   // 'email' | 'whatsapp'
  const status          = searchParams.get('status');
  const limit           = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);

  // ── Guard: non-super-admins can only see their schools ──────────
  if (!isSuperAdmin) {
    if (schoolId && !allowedSchoolIds.includes(schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!schoolId && !registrationId) {
      // Must scope by school
      return NextResponse.json({ logs: [] });
    }
  }

  // ── Build query ─────────────────────────────────────────────────
  let query = service
    .from('notification_logs')
    .select(`
      id,
      created_at,
      sent_at,
      registration_id,
      school_id,
      trigger_id,
      channel,
      provider,
      recipient,
      status,
      provider_response,
      notification_triggers (
        event_type,
        notification_templates ( name, subject )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (schoolId)       query = query.eq('school_id', schoolId) as any;
  if (registrationId) query = query.eq('registration_id', registrationId) as any;
  if (channel)        query = query.eq('channel', channel) as any;
  if (status)         query = query.eq('status', status) as any;

  // Scope non-super-admins if no explicit schoolId was passed
  if (!isSuperAdmin && !schoolId && allowedSchoolIds.length) {
    query = query.in('school_id', allowedSchoolIds) as any;
  }

  const { data: logs, error } = await query;

  if (error) {
    console.error('[notification-logs] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Flatten for easy consumption by the panels ─────────────────
  const flat = (logs ?? []).map((r: any) => ({
    id:              r.id,
    created_at:      r.created_at,
    sent_at:         r.sent_at,
    registration_id: r.registration_id,
    school_id:       r.school_id,
    trigger_id:      r.trigger_id,
    channel:         r.channel,
    provider:        r.provider,
    recipient:       r.recipient,
    status:          r.status,
    // Resolved from JOIN
    event_type:      r.notification_triggers?.event_type ?? null,
    trigger_name:    r.notification_triggers?.notification_templates?.name ?? null,
    template_subject: r.notification_triggers?.notification_templates?.subject ?? null,
    // Raw response (for debugging)
    provider_response: r.provider_response,
  }));

  return NextResponse.json({ logs: flat });
}
