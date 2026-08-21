// app/api/admin/consultant-communication-logs/route.ts
// GET — returns a history of emails/WhatsApp messages sent to consultants,
// enriched with the consultant's name/email so the admin log is readable
// without a separate lookup.

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles')
    .select('role,school_id')
    .eq('user_id', user.id)
    .single();
  return data ? { user, role: data } : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const channel      = searchParams.get('channel');       // 'email' | 'whatsapp'
  const status       = searchParams.get('status');         // 'sent' | 'failed'
  const consultantId = searchParams.get('consultant_id');
  const from         = searchParams.get('from');            // YYYY-MM-DD
  const to           = searchParams.get('to');               // YYYY-MM-DD
  const limit        = Math.min(Number(searchParams.get('limit') ?? 300), 500);

  const service = createServiceClient();

  let query = service
    .from('notification_logs')
    .select('id, consultant_id, channel, provider, recipient, status, sent_at, created_at, sent_by_name, template_name')
    .not('consultant_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (channel)      query = query.eq('channel', channel);
  if (status)       query = query.eq('status', status);
  if (consultantId) query = query.eq('consultant_id', consultantId);
  if (from)         query = query.gte('created_at', `${from}T00:00:00`);
  if (to)           query = query.lte('created_at', `${to}T23:59:59`);

  const { data: logs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Enrich with consultant name/code so the UI doesn't need a second round trip.
  const consultantIds = [...new Set((logs ?? []).map(l => l.consultant_id).filter(Boolean))];
  let nameMap: Record<string, { name: string; consultant_code: string | null }> = {};
  if (consultantIds.length > 0) {
    const { data: profiles } = await service
      .from('consultant_profiles')
      .select('user_id, consultant_code')
      .in('user_id', consultantIds);
    (profiles ?? []).forEach((p: any) => {
      nameMap[p.user_id] = { name: '', consultant_code: p.consultant_code ?? null };
    });
  }

  // Pull display names from auth.users (service role can read this) —
  // fetched per-id rather than listUsers() so it scales beyond 1000 admins/consultants.
  if (consultantIds.length > 0) {
    const results = await Promise.all(
      consultantIds.map(id => service.auth.admin.getUserById(id).catch(() => null))
    );
    results.forEach((r: any, i: number) => {
      const u = r?.data?.user;
      const id = consultantIds[i];
      if (u) {
        nameMap[id] = {
          name: (u.user_metadata as any)?.name || u.email || 'Consultant',
          consultant_code: nameMap[id]?.consultant_code ?? null,
        };
      }
    });
  }

  const enriched = (logs ?? []).map(l => ({
    ...l,
    consultant_name: nameMap[l.consultant_id]?.name ?? null,
    consultant_code: nameMap[l.consultant_id]?.consultant_code ?? null,
  }));

  return NextResponse.json({ logs: enriched });
}
