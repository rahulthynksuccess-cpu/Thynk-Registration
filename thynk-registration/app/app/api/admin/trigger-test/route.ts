export const dynamic = 'force-dynamic';
/**
 * Manual trigger test endpoint — fires a real trigger for an existing school
 * or registration without creating any new data.
 *
 * Usage examples:
 *
 *   Test school.registered for a school (by school ID):
 *   GET /api/admin/trigger-test?event=school.registered&schoolId=3b5ade6c-6556-4659-8d3f-c5c22b836e93
 *
 *   Test payment.paid for an existing registration:
 *   GET /api/admin/trigger-test?event=payment.paid&registrationId=<uuid>&schoolId=<uuid>
 *
 *   Test registration.created for an existing registration:
 *   GET /api/admin/trigger-test?event=registration.created&registrationId=<uuid>&schoolId=<uuid>
 *
 * Returns a JSON summary of what happened (sent/failed + provider).
 *
 * ⚠  DELETE THIS FILE after testing — it has no auth check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fireTriggers } from '@/lib/triggers/fire';

const ALLOWED_EVENTS = [
  'school.registered',
  'school.approved',
  'registration.created',
  'payment.paid',
  'payment.failed',
] as const;

type AllowedEvent = typeof ALLOWED_EVENTS[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const event          = searchParams.get('event') as AllowedEvent | null;
  const schoolId       = searchParams.get('schoolId')       ?? '';
  const registrationId = searchParams.get('registrationId') ?? '';

  // ── Validation ─────────────────────────────────────────────────
  if (!event || !ALLOWED_EVENTS.includes(event)) {
    return NextResponse.json({
      error: 'Pass ?event=school.registered (or school.approved / registration.created / payment.paid / payment.failed)',
      allowed: ALLOWED_EVENTS,
    }, { status: 400 });
  }

  if (!schoolId) {
    return NextResponse.json({
      error: 'Pass ?schoolId=<your-school-uuid>',
      hint: 'Find it in Supabase → schools table, or Admin → Schools → click a school → copy its ID from the URL',
    }, { status: 400 });
  }

  const isStudentEvent = event.startsWith('registration.') || event.startsWith('payment.');
  if (isStudentEvent && !registrationId) {
    return NextResponse.json({
      error: `Event "${event}" requires ?registrationId=<uuid>`,
      hint: 'Find a registration ID in Supabase → registrations table, or Admin → Students',
    }, { status: 400 });
  }

  // ── Fire ────────────────────────────────────────────────────────
  const started = Date.now();
  let fired = false;
  let errorMsg: string | null = null;

  try {
    await fireTriggers(event, registrationId, schoolId);
    fired = true;
  } catch (err: any) {
    errorMsg = err?.message ?? 'unknown error';
  }

  return NextResponse.json({
    success:         fired,
    event,
    schoolId,
    registrationId:  registrationId || null,
    elapsed_ms:      Date.now() - started,
    error:           errorMsg,
    note:            'Check Vercel logs AND Admin → Notification Logs for delivery status.',
  });
}
