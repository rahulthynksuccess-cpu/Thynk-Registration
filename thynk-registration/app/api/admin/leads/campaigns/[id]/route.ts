/**
 * app/api/admin/leads/campaigns/[id]/route.ts
 * GET — fetch all per-recipient logs for a single campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { id } = params;

  const { data: campaign } = await service
    .from('lead_broadcast_campaigns')
    .select('*, schools(name), projects(name)')
    .eq('id', id).single();

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: logs } = await service
    .from('lead_broadcast_logs')
    .select('*')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ campaign, logs: logs ?? [] });
}
