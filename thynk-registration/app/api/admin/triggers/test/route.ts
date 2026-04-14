/**
 * app/api/admin/triggers/test/route.ts
 *
 * POST /api/admin/triggers/test
 *
 * Diagnostic endpoint — fires a trigger event manually against a real
 * registration or school, so you can verify the full pipeline works
 * without waiting for an actual payment.
 *
 * Body:
 *   {
 *     event:           TriggerEvent        — e.g. 'registration.created'
 *     registration_id?: string             — required for registration/payment events
 *     school_id:       string              — always required
 *   }
 *
 * Returns:
 *   {
 *     triggers_found: number,
 *     results: Array<{ trigger_id, channel, status, provider?, error? }>
 *   }
 *
 * Super-admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { fireTriggers } from '@/lib/triggers/fire';
import type { TriggerEvent } from '@/lib/types';

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
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

const VALID_EVENTS: TriggerEvent[] = [
  'registration.created',
  'payment.paid',
  'payment.failed',
  'payment.cancelled',
  'discount.applied',
  'school.registered',
  'school.approved',
];

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });

  const body = await req.json();
  const { event, registration_id = '', school_id } = body;

  if (!event || !school_id) {
    return NextResponse.json({ error: 'event and school_id are required' }, { status: 400 });
  }

  if (!VALID_EVENTS.includes(event)) {
    return NextResponse.json({
      error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}`,
    }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Pre-flight: check how many active triggers exist for this event+school
  const { data: triggers, error: queryErr } = await supabase
    .from('notification_triggers')
    .select('id, channel, event_type, is_active, notification_templates(name, is_active)')
    .or(`school_id.eq.${school_id},school_id.is.null`)
    .eq('event_type', event)
    .eq('is_active', true);

  if (queryErr) {
    return NextResponse.json({
      error: 'DB query failed: ' + queryErr.message,
      hint: 'This usually means the event_type CHECK constraint still has the old underscore values. Run migration 005.',
    }, { status: 500 });
  }

  if (!triggers?.length) {
    // Dig deeper — check if any triggers exist with the old format
    const { data: oldStyleTriggers } = await supabase
      .from('notification_triggers')
      .select('id, event_type, is_active')
      .or(`school_id.eq.${school_id},school_id.is.null`);

    return NextResponse.json({
      triggers_found: 0,
      results: [],
      diagnosis: {
        message: 'No active triggers found for this event + school combination.',
        all_trigger_event_types: oldStyleTriggers?.map(t => t.event_type) ?? [],
        hint: oldStyleTriggers?.some(t => t.event_type.includes('_'))
          ? '⚠️ Found triggers with underscore format (old style). Run migration 005 to fix event_type values.'
          : 'Create a trigger in Admin → Message Triggers for this event.',
      },
    });
  }

  // Fire the trigger for real
  try {
    await fireTriggers(event as TriggerEvent, registration_id, school_id);
  } catch (err: any) {
    return NextResponse.json({
      error: 'fireTriggers threw: ' + err?.message,
    }, { status: 500 });
  }

  // Read the most recent log entries to report results
  const { data: logs } = await supabase
    .from('notification_logs')
    .select('trigger_id, channel, status, provider, recipient, sent_at')
    .eq('school_id', school_id)
    .order('created_at', { ascending: false })
    .limit(triggers.length * 2);

  return NextResponse.json({
    triggers_found: triggers.length,
    triggers: triggers.map((t: any) => ({
      id: t.id,
      channel: t.channel,
      event_type: t.event_type,
      template: t.notification_templates?.name ?? '(no template)',
      template_active: t.notification_templates?.is_active ?? false,
    })),
    recent_logs: logs ?? [],
  });
}
