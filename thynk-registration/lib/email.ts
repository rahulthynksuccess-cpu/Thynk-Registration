import { createServiceClient } from '@/lib/supabase/server';
import type { TriggerEvent, TemplateVars } from '@/lib/types';

/**
 * Main entry point — call this after registration or payment status change.
 *
 * Usage:
 *   await dispatchTrigger('payment.paid', {
 *     registrationId: reg.id,
 *     studentName: 'Aryan',
 *     ...
 *   });
 */
export async function dispatchTrigger(
  event: TriggerEvent,
  vars: TemplateVars,
): Promise<void> {
  const supabase = createServiceClient();

  // Look up active email templates for this event + school
  const { data: templates, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('trigger_event', event)
    .eq('school_id', vars.schoolId ?? null)
    .eq('is_active', true);

  if (error || !templates?.length) return;

  for (const tpl of templates) {
    const subject = interpolate(tpl.subject, vars);
    const body    = interpolate(tpl.body_html, vars);

    await sendEmail({
      to:      vars.contactEmail ?? '',
      subject,
      html:    body,
    });
  }
}

/** Replace {{variableName}} placeholders with actual values. */
function interpolate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

interface SendEmailOptions {
  to:      string;
  subject: string;
  html:    string;
  from?:   string;
}

/**
 * Low-level send via the configured provider.
 * Swap the body of this function to use Resend, Nodemailer, SendGrid, etc.
 */
async function sendEmail({ to, subject, html, from }: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // No email provider configured — log and continue without throwing
    console.warn('[email] RESEND_API_KEY not set, skipping email to', to);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    from ?? process.env.EMAIL_FROM ?? 'noreply@thynk.app',
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[email] Send failed:', res.status, text);
  }
}
