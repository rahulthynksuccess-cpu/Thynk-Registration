// app/api/admin/followups/route.ts
// Shared follow-up log for both Consultants and Schools.
//
// GET  /api/admin/followups?entity_type=consultant|school&entity_id=<uuid>
//   → full history, most recent first (comment, next_followup_date, who, when)
//
// POST /api/admin/followups { entity_type, entity_id, comment, next_followup_date }
//   → inserts a history row AND caches the latest follow-up + next date onto
//     the parent record (consultant_profiles / schools) so list views can
//     show "Next Follow-up" and "Last Comment" without an extra join.

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdminLike(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roleRows } = await service
    .from('admin_roles')
    .select('role, allowed_pages')
    .eq('user_id', user.id);
  const allowed = roleRows?.some(r => ['super_admin', 'sub_admin', 'consultant'].includes(r.role));
  return allowed ? user : null;
}

export async function GET(req: NextRequest) {
  const user = await requireAdminLike(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entity_type');
  const entityId   = searchParams.get('entity_id');

  if (!entityType || !entityId || !['consultant', 'school'].includes(entityType)) {
    return NextResponse.json({ error: 'entity_type (consultant|school) and entity_id are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('followups')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ followups: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await requireAdminLike(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const body = await req.json();
  const { entity_type: entityType, entity_id: entityId, comment, next_followup_date: nextFollowupDate } = body;

  if (!entityType || !entityId || !['consultant', 'school'].includes(entityType)) {
    return NextResponse.json({ error: 'entity_type (consultant|school) and entity_id are required' }, { status: 400 });
  }
  if ((!comment || !comment.trim()) && !nextFollowupDate) {
    return NextResponse.json({ error: 'Provide a comment and/or a next follow-up date' }, { status: 400 });
  }

  const actorName = (user.user_metadata as any)?.name || user.email || 'Admin';
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertErr } = await service
    .from('followups')
    .insert({
      entity_type:        entityType,
      entity_id:          entityId,
      comment:            comment?.trim() || null,
      next_followup_date: nextFollowupDate || null,
      created_by:         user.id,
      created_by_name:    actorName,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Cache the latest state onto the parent record for quick list display.
  const cacheUpdate: Record<string, any> = {
    last_followup_at:      nowIso,
    last_followup_comment: comment?.trim() || null,
    last_followup_by:      actorName,
  };
  // Only overwrite next_followup_date when one was actually provided — an
  // admin logging a comment without changing the next date shouldn't clear it.
  if (nextFollowupDate !== undefined) cacheUpdate.next_followup_date = nextFollowupDate || null;

  const table = entityType === 'consultant' ? 'consultant_profiles' : 'schools';
  const idCol = entityType === 'consultant' ? 'user_id' : 'id';
  await service.from(table).update(cacheUpdate).eq(idCol, entityId);

  return NextResponse.json({ followup: inserted });
}
