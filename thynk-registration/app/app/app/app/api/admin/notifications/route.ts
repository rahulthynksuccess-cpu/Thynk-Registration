import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient, getAdminPermissions } from '@/lib/supabase/server';
import { createDashboardNotification } from '@/lib/notifications';

// ── GET /api/admin/notifications?audience=admin&schoolId=xxx&unread=true ──────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const audience = searchParams.get('audience') ?? 'admin'; // 'admin' | 'school' | 'both'
  const schoolId = searchParams.get('schoolId');
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  let query = service
    .from('dashboard_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (audience === 'admin') {
    query = query.in('audience', ['admin', 'both']);
  } else if (audience === 'school') {
    query = query.in('audience', ['school', 'both']);
    if (schoolId) query = query.or(`school_id.eq.${schoolId},school_id.is.null`);
  }

  const { data: notifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach read status for current user
  const ids = (notifications ?? []).map((n: any) => n.id);
  let readIds = new Set<string>();
  if (ids.length > 0) {
    const { data: reads } = await service
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', user.id)
      .in('notification_id', ids);
    readIds = new Set((reads ?? []).map((r: any) => r.notification_id));
  }

  const enriched = (notifications ?? []).map((n: any) => ({
    ...n,
    is_read: readIds.has(n.id),
  }));

  const filtered = unreadOnly ? enriched.filter((n: any) => !n.is_read) : enriched;
  const unreadCount = enriched.filter((n: any) => !n.is_read).length;

  return NextResponse.json({ notifications: filtered, unread_count: unreadCount });
}

// ── POST /api/admin/notifications  (admin sends a manual notification) ────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = await getAdminPermissions(req);
  if (!perms) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    school_id,    // null = broadcast to all schools
    audience,     // 'admin' | 'school' | 'both'
    type,         // 'info' | 'success' | 'warning' | 'alert' | 'document'
    title,
    message,
    entity_type,
    entity_id,
  } = body;

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message are required' }, { status: 400 });
  }

  const notification = await createDashboardNotification({
    schoolId:   school_id ?? null,
    audience:   audience ?? 'both',
    type:       type ?? 'info',
    title,
    message,
    entityType: entity_type,
    entityId:   entity_id,
    createdBy:  user.id,
  });

  return NextResponse.json({ notification }, { status: 201 });
}

// ── PATCH /api/admin/notifications  (mark as read) ────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { notification_ids, mark_all } = body;

  const service = createServiceClient();

  if (mark_all) {
    // Fetch all unread notifications for this user and mark them read
    const { data: notifs } = await service
      .from('dashboard_notifications')
      .select('id')
      .in('audience', ['admin', 'both']);

    const ids = (notifs ?? []).map((n: any) => n.id);
    if (ids.length) {
      await service.from('notification_reads').upsert(
        ids.map((id: string) => ({ notification_id: id, user_id: user.id })),
        { onConflict: 'notification_id,user_id' }
      );
    }
    return NextResponse.json({ marked: ids.length });
  }

  if (!notification_ids?.length) {
    return NextResponse.json({ error: 'notification_ids or mark_all required' }, { status: 400 });
  }

  await service.from('notification_reads').upsert(
    notification_ids.map((id: string) => ({ notification_id: id, user_id: user.id })),
    { onConflict: 'notification_id,user_id' }
  );

  return NextResponse.json({ marked: notification_ids.length });
}
