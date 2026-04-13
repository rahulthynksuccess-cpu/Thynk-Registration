/**
 * app/api/admin/send/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/admin/send
 *
 * Manually send a template message (WhatsApp or Email) to a school contact.
 * Used by the School Detail Modal "WhatsApp" and "Email" buttons.
 *
 * Body:
 *   {
 *     channel:     'whatsapp' | 'email'
 *     template_id: string          — notification_templates.id
 *     school_id:   string          — school to send on behalf of
 *     to_phone?:   string          — recipient phone (whatsapp)
 *     to_email?:   string          — recipient email (email)
 *     vars?:       Record<string,string>  — extra template variables
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/triggers/fire';

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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { channel, template_id, school_id, to_phone, to_email, vars = {} } = body;

  if (!channel || !template_id || !school_id) {
    return NextResponse.json({ error: 'channel, template_id and school_id are required' }, { status: 400 });
  }
  if (channel === 'whatsapp' && !to_phone) {
    return NextResponse.json({ error: 'to_phone required for whatsapp' }, { status: 400 });
  }
  if (channel === 'email' && !to_email) {
    return NextResponse.json({ error: 'to_email required for email' }, { status: 400 });
  }

  const service = createServiceClient();

  // Load template
  const { data: template, error: tErr } = await service
    .from('notification_templates')
    .select('*')
    .eq('id', template_id)
    .single();

  if (tErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Render template with provided vars
  const renderedBody    = renderTemplate(template.body, vars);
  const renderedSubject = template.subject ? renderTemplate(template.subject, vars) : `Message from ${vars.school_name ?? 'Thynk'}`;

  try {
    let provider = '';

    if (channel === 'whatsapp') {
      provider = await dispatchWhatsApp(service, school_id, to_phone, renderedBody);
    } else {
      provider = await dispatchEmail(service, school_id, to_email, renderedSubject, renderedBody);
    }

    // Log the manual send
    await service.from('notification_logs').insert({
      school_id,
      channel,
      provider,
      recipient: channel === 'whatsapp' ? to_phone : to_email,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, provider });

  } catch (err: any) {
    // Log failure
    await service.from('notification_logs').insert({
      school_id,
      channel,
      provider: 'unknown',
      recipient: channel === 'whatsapp' ? (to_phone ?? '') : (to_email ?? ''),
      status: 'failed',
    });
    return NextResponse.json({ error: err.message ?? 'Send failed' }, { status: 500 });
  }
}

// ── WhatsApp dispatcher ──────────────────────────────────────────────────────
async function dispatchWhatsApp(service: any, schoolId: string, phone: string, body: string): Promise<string> {
  // Try ThynkComm first (platform_settings), then WhatsApp Cloud / Twilio
  const { data: platformRow } = await service
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();

  const wa = platformRow?.config?.whatsapp_settings;

  // platform_settings uses 'thynkcomm' | 'meta' | 'twilio' as provider names
  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const url = wa.tcUrl.replace(/\/$/, '') + '/api/send-message';
    const normalized = phone.replace(/\D/g, '');
    const to = normalized.startsWith('91') ? normalized : `91${normalized}`;
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

  // Check for Meta Cloud API in platform_settings
  if (wa?.provider === 'meta' && wa?.metaPhoneId && wa?.metaToken) {
    const normalized = phone.replace(/\D/g, '');
    const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized.startsWith('91') ? normalized : `91${normalized}`,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Meta WhatsApp error: ${JSON.stringify(e)}`);
    }
    return 'meta_whatsapp';
  }

  // Check for Twilio in platform_settings
  if (wa?.provider === 'twilio' && wa?.accountSid && wa?.authToken && wa?.fromNumber) {
    const normalized = phone.replace(/\D/g, '');
    const creds = Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64');
    const from = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: from,
        To: `whatsapp:+${normalized.startsWith('91') ? normalized : '91' + normalized}`,
        Body: body,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio (platform) error: ${res.status}`);
    return 'twilio';
  }

  // Fall back to integration_configs (WhatsApp Cloud / Twilio)
  const { data: configs } = await service
    .from('integration_configs')
    .select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['whatsapp_cloud', 'twilio'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .limit(1);

  const cfg = configs?.[0];
  const normalized = phone.replace(/\D/g, '');

  if (!cfg || cfg.provider === 'whatsapp_cloud') {
    const phoneNumberId = cfg?.config?.phone_number_id ?? process.env.WA_PHONE_NUMBER_ID;
    const token         = cfg?.config?.token            ?? process.env.WA_TOKEN;
    if (!phoneNumberId || !token) throw new Error('No WhatsApp provider configured');

    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized.startsWith('91') ? normalized : `91${normalized}`,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`WhatsApp Cloud error: ${JSON.stringify(e)}`);
    }
    return 'whatsapp_cloud';
  }

  if (cfg.provider === 'twilio') {
    const accountSid = cfg.config.account_sid   ?? process.env.TWILIO_ACCOUNT_SID;
    const authToken  = cfg.config.auth_token    ?? process.env.TWILIO_AUTH_TOKEN;
    const from       = cfg.config.whatsapp_from ?? process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken || !from) throw new Error('Twilio not configured');
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: `whatsapp:+${from}`,
        To:   `whatsapp:+${normalized.startsWith('91') ? normalized : '91' + normalized}`,
        Body: body,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio error: ${res.status}`);
    return 'twilio';
  }

  throw new Error('No WhatsApp provider configured');
}

// ── Email dispatcher ─────────────────────────────────────────────────────────
async function dispatchEmail(
  service: any,
  schoolId: string,
  to: string,
  subject: string,
  body: string
): Promise<string> {
  // Try platform_settings SMTP first
  const { data: platformRow } = await service
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
  const { data: configs } = await service
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

async function sendViaSMTP(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host:   config.smtpHost ?? config.host ?? process.env.SMTP_HOST,
    port:   Number(config.smtpPort ?? config.port ?? process.env.SMTP_PORT ?? 587),
    secure: Number(config.smtpPort ?? config.port ?? 587) === 465,
    auth: {
      user: config.smtpUser ?? config.user     ?? process.env.SMTP_USER,
      pass: config.smtpPass ?? config.password ?? process.env.SMTP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `${config.fromName ?? config.from_name ?? 'Thynk Registration'} <${config.fromEmail ?? config.from_email ?? process.env.SMTP_FROM}>`,
    to, subject,
    html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
  });
}

async function sendViaSendGrid(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const apiKey = config.api_key ?? process.env.SENDGRID_API_KEY;
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.from_email ?? process.env.SENDGRID_FROM, name: config.from_name ?? 'Thynk' },
      subject,
      content: [{ type: 'text/html', value: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>` }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid error: ${res.status}`);
}

async function sendViaSES(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({
    region: config.region ?? process.env.AWS_SES_REGION ?? 'us-east-1',
    credentials: config.access_key_id ? {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key ?? process.env.AWS_SES_SECRET,
    } : undefined,
  });
  await client.send(new SendEmailCommand({
    Source: `${config.from_name ?? 'Thynk'} <${config.from_email ?? process.env.AWS_SES_FROM}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>` } },
    },
  }));
}
