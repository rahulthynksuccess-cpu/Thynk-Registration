import { createServiceClient } from '@/lib/supabase/server';
import type { TriggerEvent, TemplateVars } from '@/lib/types';

/**
 * Main entry point — call this after registration or payment status change.
 * Loads active triggers for the event, resolves template vars, dispatches notifications.
 */
export async function fireTriggers(
  event: TriggerEvent,
  registrationId: string,
  schoolId: string
): Promise<void> {
  const supabase = createServiceClient();

  // 1. Load active triggers for this event + school
  const { data: triggers } = await supabase
    .from('notification_triggers')
    .select('*, notification_templates(*)')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .eq('event_type', event)
    .eq('is_active', true);

  if (!triggers?.length) return;

  // 2. Load registration + payment + school data for template vars
  const vars = await buildTemplateVars(registrationId, schoolId, event);
  if (!vars) return;

  // 3. Dispatch each trigger
  for (const trigger of triggers) {
    const template = trigger.notification_templates;
    if (!template?.is_active) continue;

    // FIX #1: vars uses snake_case (contact_email, contact_phone) — use them consistently.
    const logEntry: {
      registration_id: string;
      school_id: string;
      trigger_id: string;
      channel: string;
      provider: string;
      recipient: string;
      status: 'pending' | 'sent' | 'failed';
    } = {
      registration_id: registrationId,
      school_id: schoolId,
      trigger_id: trigger.id,
      channel: trigger.channel,
      provider: '',
      recipient: trigger.channel === 'email'
        ? (vars.contact_email ?? '')
        : (vars.contact_phone ?? ''),
      status: 'pending',
    };

    try {
      if (trigger.channel === 'email') {
        const provider = await sendEmail(template, vars, schoolId);
        logEntry.provider = provider;
        logEntry.status = 'sent';
      } else if (trigger.channel === 'whatsapp') {
        const provider = await sendWhatsApp(template, vars, schoolId);
        logEntry.provider = provider;
        logEntry.status = 'sent';
      }
    } catch (err: any) {
      logEntry.status = 'failed';
      console.error(`[trigger] Failed to send ${trigger.channel} for event ${event}:`, err?.message);
    }

    // 4. Log outcome
    await supabase.from('notification_logs').insert({
      ...logEntry,
      sent_at: logEntry.status === 'sent' ? new Date().toISOString() : null,
    });
  }
}

// ── Template variable builder ─────────────────────────────────────
// Returns snake_case keys matching {{contact_email}} / {{school_name}} placeholders in templates.
async function buildTemplateVars(
  registrationId: string,
  schoolId: string,
  event: TriggerEvent
): Promise<TemplateVars | null> {
  const supabase = createServiceClient();

  const { data: reg } = await supabase
    .from('registrations')
    .select('*, schools(name, org_name), pricing(program_name), payments(gateway, gateway_txn_id, final_amount, paid_at, status)')
    .eq('id', registrationId)
    .single();

  if (!reg) return null;

  const payment = reg.payments?.[0];
  const school  = reg.schools as any;
  const pricing = reg.pricing as any;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return {
    student_name:  reg.student_name,
    parent_name:   reg.parent_name,
    // FIX #1: Guarantee strings (never undefined) so .replace() calls never crash
    contact_phone: reg.contact_phone ?? '',
    contact_email: reg.contact_email ?? '',
    class_grade:   reg.class_grade,
    parent_school: reg.parent_school,
    city:          reg.city,
    school_name:   school?.name ?? '',
    org_name:      school?.org_name ?? '',
    program_name:  pricing?.program_name ?? '',
    amount:        payment?.final_amount ? `₹${(payment.final_amount / 100).toLocaleString('en-IN')}` : undefined,
    txn_id:        payment?.gateway_txn_id ?? undefined,
    gateway:       payment?.gateway ?? undefined,
    paid_at:       payment?.paid_at ? new Date(payment.paid_at).toLocaleDateString('en-IN') : undefined,
    retry_link:    event === 'payment.failed' ? `${appUrl}/${reg.school_id}` : undefined,
  };
}

// ── Render template body with {{variables}} ───────────────────────
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return (vars as any)[key] ?? `{{${key}}}`;
  });
}

// ── Email dispatch ────────────────────────────────────────────────
async function sendEmail(
  template: any,
  vars: TemplateVars,
  schoolId: string
): Promise<string> {
  const supabase = createServiceClient();

  const subject = template.subject ? renderTemplate(template.subject, vars) : `${vars.school_name} — Registration Update`;
  const body    = renderTemplate(template.body, vars);
  const to      = vars.contact_email ?? '';

  // FIX #2: Check platform_settings SMTP first — same priority as send/route.ts.
  // Previously this was skipped, so admin-configured SMTP (Settings UI) was ignored.
  const { data: platformRow } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();

  const emailCfg = platformRow?.config?.email_settings;
  if (emailCfg?.smtpHost && emailCfg?.smtpUser) {
    await sendViaSMTP(emailCfg, { to, subject, body });
    return 'smtp';
  }

  // Fall back to integration_configs
  const { data: configs } = await supabase
    .from('integration_configs')
    .select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['smtp', 'sendgrid', 'aws_ses'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true })
    .limit(1);

  const cfg = configs?.[0];

  if (!cfg || cfg.provider === 'smtp') {
    await sendViaSMTP(cfg?.config ?? {}, { to, subject, body });
    return 'smtp';
  }
  if (cfg.provider === 'sendgrid') {
    await sendViaSendGrid(cfg.config, { to, subject, body });
    return 'sendgrid';
  }
  if (cfg.provider === 'aws_ses') {
    await sendViaSES(cfg.config, { to, subject, body });
    return 'aws_ses';
  }

  throw new Error('No email provider configured');
}

// ── WhatsApp dispatch ─────────────────────────────────────────────
async function sendWhatsApp(
  template: any,
  vars: TemplateVars,
  schoolId: string
): Promise<string> {
  const supabase = createServiceClient();

  const body = renderTemplate(template.body, vars);

  // FIX #5: Guard against missing phone — never crash the whole trigger loop
  const rawPhone = vars.contact_phone ?? '';
  if (!rawPhone) throw new Error('contact_phone is empty — cannot send WhatsApp');
  const phone = rawPhone.replace(/\D/g, '');

  // FIX #3: Check platform_settings WhatsApp first — same priority as send/route.ts.
  // Previously this was skipped, so ThynkComm / Meta / Twilio set via Settings UI
  // were completely ignored for triggered messages.
  const { data: platformRow } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();

  const wa = platformRow?.config?.whatsapp_settings;

  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const url = wa.tcUrl.replace(/\/$/, '') + '/api/send-message';
    const to = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': wa.tcApiKey,
        'x-api-secret': wa.tcApiSecret ?? '',
      },
      body: JSON.stringify({ to, message: body }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`ThynkComm error: ${e.message ?? res.status}`);
    }
    return 'thynkcomm';
  }

  if (wa?.provider === 'meta' && wa?.metaPhoneId && wa?.metaToken) {
    const to = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Meta WhatsApp error: ${JSON.stringify(e)}`);
    }
    return 'meta_whatsapp';
  }

  if (wa?.provider === 'twilio' && wa?.accountSid && wa?.authToken && wa?.fromNumber) {
    const to = phone.startsWith('91') ? phone : `91${phone}`;
    const creds = Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64');
    const from = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio (platform) error: ${res.status}`);
    return 'twilio';
  }

  // Fall back to integration_configs
  const { data: configs } = await supabase
    .from('integration_configs')
    .select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['whatsapp_cloud', 'twilio'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true })
    .limit(1);

  const cfg = configs?.[0];

  if (!cfg || cfg.provider === 'whatsapp_cloud') {
    await sendViaWhatsAppCloud(cfg?.config ?? {}, phone, body);
    return 'whatsapp_cloud';
  }
  if (cfg.provider === 'twilio') {
    await sendViaTwilio(cfg.config, phone, body);
    return 'twilio';
  }

  throw new Error('No WhatsApp provider configured');
}

// ── SMTP sender ───────────────────────────────────────────────────
// FIX #4: Accept BOTH key naming conventions:
//   - smtpHost / smtpPort / smtpUser / smtpPass / fromName / fromEmail  (Admin Settings UI)
//   - host / port / user / password / from_name / from_email            (integration_configs format)
async function sendViaSMTP(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host:   config.smtpHost   ?? config.host     ?? process.env.SMTP_HOST,
    port:   Number(config.smtpPort ?? config.port ?? process.env.SMTP_PORT ?? 587),
    secure: Number(config.smtpPort ?? config.port ?? 587) === 465,
    auth: {
      user: config.smtpUser ?? config.user     ?? process.env.SMTP_USER,
      pass: config.smtpPass ?? config.password ?? process.env.SMTP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `${config.fromName ?? config.from_name ?? 'Thynk Success'} <${config.fromEmail ?? config.from_email ?? process.env.SMTP_FROM}>`,
    to, subject,
    html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
  });
}

// ── SendGrid sender ───────────────────────────────────────────────
async function sendViaSendGrid(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const apiKey = config.api_key ?? process.env.SENDGRID_API_KEY;
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.from_email ?? process.env.SENDGRID_FROM, name: config.from_name ?? 'Thynk Success' },
      subject,
      content: [{ type: 'text/html', value: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>` }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid error: ${res.status}`);
}

// ── AWS SES sender ────────────────────────────────────────────────
async function sendViaSES(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({
    region: config.region ?? process.env.AWS_SES_REGION ?? 'us-east-1',
    credentials: config.access_key_id ? {
      accessKeyId:     config.access_key_id,
      secretAccessKey: config.secret_access_key ?? process.env.AWS_SES_SECRET,
    } : undefined,
  });
  await client.send(new SendEmailCommand({
    Source: `${config.from_name ?? 'Thynk Success'} <${config.from_email ?? process.env.AWS_SES_FROM}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>` } },
    },
  }));
}

// ── WhatsApp Cloud API sender ─────────────────────────────────────
async function sendViaWhatsAppCloud(config: any, phone: string, body: string) {
  const phoneNumberId = config.phone_number_id ?? process.env.WA_PHONE_NUMBER_ID;
  const token         = config.token            ?? process.env.WA_TOKEN;
  if (!phoneNumberId || !token) throw new Error('WhatsApp Cloud API not configured');

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.startsWith('91') ? phone : `91${phone}`,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp Cloud error: ${JSON.stringify(err)}`);
  }
}

// ── Twilio WhatsApp sender ────────────────────────────────────────
async function sendViaTwilio(config: any, phone: string, body: string) {
  const accountSid = config.account_sid   ?? process.env.TWILIO_ACCOUNT_SID;
  const authToken  = config.auth_token    ?? process.env.TWILIO_AUTH_TOKEN;
  const from       = config.whatsapp_from ?? process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) throw new Error('Twilio not configured');

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: `whatsapp:+${from}`,
      To:   `whatsapp:+${phone.startsWith('91') ? phone : '91' + phone}`,
      Body: body,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio error: ${res.status}`);
}
