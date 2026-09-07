import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

// ── GET /api/school/notifications ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from('admin_roles')
    .select('school_id')
    .eq('user_id', user.id)
    .eq('role', 'school_admin')
    .maybeSingle();

  if (!roleRow?.school_id) {
    return NextResponse.json({ error: 'No school associated with this account' }, { status: 403 });
  }

  const schoolId = roleRow.school_id;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100);

  const { data: notifications, error } = await service
    .from('dashboard_notifications')
    .select('*')
    .in('audience', ['school', 'both'])
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach read status
  const ids = (notifications ?? []).map((n: any) => n.id);
  let readIds = new Set<string>();
  if (ids.length) {
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

  return NextResponse.json({
    notifications: enriched,
    unread_count: enriched.filter((n: any) => !n.is_read).length,
  });
}

// ── PATCH /api/school/notifications  (mark as read) ───────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { notification_ids, mark_all } = body;
  const service = createServiceClient();

  if (mark_all) {
    const { data: roleRow } = await service
      .from('admin_roles')
      .select('school_id')
      .eq('user_id', user.id)
      .eq('role', 'school_admin')
      .maybeSingle();

    if (!roleRow?.school_id) return NextResponse.json({ marked: 0 });

    const { data: notifs } = await service
      .from('dashboard_notifications')
      .select('id')
      .in('audience', ['school', 'both'])
      .or(`school_id.eq.${roleRow.school_id},school_id.is.null`);

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
    return NextResponse.json({ error: 'notification_ids required' }, { status: 400 });
  }

  await service.from('notification_reads').upsert(
    notification_ids.map((id: string) => ({ notification_id: id, user_id: user.id })),
    { onConflict: 'notification_id,user_id' }
  );

  return NextResponse.json({ marked: notification_ids.length });
}
