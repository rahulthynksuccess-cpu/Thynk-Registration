/**
 * app/api/admin/send/route.ts
 * POST /api/admin/send
 * Manually send a template message (WhatsApp or Email) to a single recipient.
 * Uses the SAME email/WhatsApp logic as lib/triggers/fire.ts.
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
  const { channel, template_id, school_id, registration_id, to_phone, to_email, vars = {}, smtp_config_id } = body;

  if (!channel || !template_id || !school_id)
    return NextResponse.json({ error: 'channel, template_id and school_id are required' }, { status: 400 });
  if (channel === 'whatsapp' && !to_phone)
    return NextResponse.json({ error: 'to_phone required for whatsapp' }, { status: 400 });
  if (channel === 'email' && !to_email)
    return NextResponse.json({ error: 'to_email required for email' }, { status: 400 });

  const service = createServiceClient();

  const { data: template, error: tErr } = await service
    .from('notification_templates')
    .select('*')
    .eq('id', template_id)
    .single();

  if (tErr || !template)
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const renderedBody    = renderTemplate(template.body, vars);
  const renderedSubject = template.subject
    ? renderTemplate(template.subject, vars)
    : `Message from ${vars.school_name ?? 'Thynk'}`;

  try {
    let provider = '';

    if (channel === 'whatsapp') {
      provider = await dispatchWhatsApp(service, school_id, to_phone, renderedBody, template, vars);
    } else {
      provider = await dispatchEmail(service, school_id, to_email, renderedSubject, renderedBody, smtp_config_id);
    }

    await service.from('notification_logs').insert({
      school_id,
      registration_id: registration_id ?? null,
      channel,
      provider,
      recipient: channel === 'whatsapp' ? to_phone : to_email,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, provider });

  } catch (err: any) {
    await service.from('notification_logs').insert({
      school_id,
      registration_id: registration_id ?? null,
      channel,
      provider: 'unknown',
      recipient: channel === 'whatsapp' ? (to_phone ?? '') : (to_email ?? ''),
      status: 'failed',
    });
    return NextResponse.json({ error: err.message ?? 'Send failed' }, { status: 500 });
  }
}

// ── Email — mirrors fire.ts sendEmail exactly ────────────────────────────────
async function dispatchEmail(
  service: any,
  schoolId: string,
  to: string,
  subject: string,
  body: string,
  smtpConfigId?: string,
): Promise<string> {
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();

  const smtpConfigs: any[] = platformRow?.config?.email_smtp_configs ?? [];
  console.log(`[send/email] smtp_configs count=${smtpConfigs.length} to=${to} smtpConfigId=${smtpConfigId ?? 'auto'}`);

  if (smtpConfigs.length > 0) {
    let smtpCfg: any = null;

    // Priority 0: user explicitly picked a config
    if (smtpConfigId) {
      smtpCfg = smtpConfigs.find((c: any) => c.id === smtpConfigId || c.smtpUser === smtpConfigId);
      console.log(`[send/email] explicit smtpConfigId lookup → ${smtpCfg ? smtpCfg.smtpHost : 'NOT FOUND'}`);
    }

    // Priority 1: program-specific SMTP
    if (!smtpCfg) {
      let programId: string | null = null;
      if (schoolId) {
        const { data: school } = await service.from('schools').select('project_id').eq('id', schoolId).single();
        programId = school?.project_id ?? null;
      }
      if (programId)
        smtpCfg = smtpConfigs.find((c: any) => c.enabled && c.program_id === programId);
    }

    // Priority 2: default (no program)
    if (!smtpCfg)
      smtpCfg = smtpConfigs.find((c: any) => c.enabled && (!c.program_id || c.program_id === ''));

    // Priority 3: any enabled
    if (!smtpCfg)
      smtpCfg = smtpConfigs.find((c: any) => c.enabled);

    console.log(`[send/email] selected smtp=${smtpCfg?.smtpHost ?? 'none'} user=${smtpCfg?.smtpUser ?? 'none'}`);

    if (smtpCfg?.smtpHost && smtpCfg?.smtpUser && smtpCfg?.smtpPass) {
      await sendViaSMTP(smtpCfg, { to, subject, body });
      return `smtp:${smtpCfg.name || smtpCfg.smtpUser}`;
    }
    console.warn(`[send/email] smtp_configs exist but none have host+user+pass`);
  }

  // Legacy single email_settings
  const emailCfg = platformRow?.config?.email_settings;
  if (emailCfg?.smtpHost && emailCfg?.smtpUser) {
    console.log(`[send/email] using legacy email_settings smtp=${emailCfg.smtpHost}`);
    await sendViaSMTP(emailCfg, { to, subject, body });
    return 'smtp';
  }

  // integration_configs table fallback
  const { data: configs } = await service
    .from('integration_configs').select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['smtp', 'sendgrid', 'aws_ses'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true }).limit(1);

  const cfg = configs?.[0];
  if (cfg?.provider === 'sendgrid') { await sendViaSendGrid(cfg.config, { to, subject, body }); return 'sendgrid'; }
  if (cfg?.provider === 'aws_ses')  { await sendViaSES(cfg.config, { to, subject, body });      return 'aws_ses'; }
  if (cfg?.provider === 'smtp')     { await sendViaSMTP(cfg.config, { to, subject, body });     return 'smtp'; }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    await sendViaSMTP({}, { to, subject, body });
    return 'smtp_env';
  }

  throw new Error(
    `No email provider configured. smtp_configs=${smtpConfigs.length} ` +
    `legacy=${!!(platformRow?.config?.email_settings?.smtpHost)} env=${!!process.env.SMTP_HOST}`
  );
}

// ── WhatsApp — mirrors fire.ts sendWhatsApp exactly ─────────────────────────
async function dispatchWhatsApp(
  service: any,
  schoolId: string,
  phone: string,
  renderedBody: string,
  template: any,
  vars: Record<string, any>,
): Promise<string> {
  const normalized = phone.replace(/\D/g, '');
  const to = normalized.startsWith('91') ? normalized : `91${normalized}`;

  const templateName: string | undefined = template.whatsapp_template_name || undefined;
  const rawLang = (template.whatsapp_template_lang ?? 'en_US').trim();
  const templateLang = rawLang === 'en' ? 'en_US' : rawLang;

  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();
  const wa = platformRow?.config?.whatsapp_settings;

  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const params = buildMetaBodyParams(template.body, vars).map((p: any) => p.text);
    const payload = templateName
      ? { to, template_name: templateName, language_code: templateLang, ...(params.length > 0 ? { template_params: params } : {}) }
      : { to, message: renderedBody };
    const res = await fetch(wa.tcUrl.replace(/\/$/, '') + '/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
      body: JSON.stringify(payload),
    });
    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`ThynkComm error ${res.status}: ${resBody.error ?? resBody.message ?? JSON.stringify(resBody)}`);
    return 'thynkcomm';
  }

  if (wa?.provider === 'meta' && wa?.metaPhoneId && wa?.metaToken) {
    const messagePayload = templateName
      ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: templateName, language: { code: templateLang }, components: [{ type: 'body', parameters: buildMetaBodyParams(template.body, vars) }] } }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: renderedBody } };
    const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messagePayload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Meta WhatsApp error: ${JSON.stringify(e)}`); }
    return 'meta_whatsapp';
  }

  if (wa?.provider === 'twilio' && wa?.accountSid && wa?.authToken && wa?.fromNumber) {
    const from = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: renderedBody }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio platform error: ${res.status}`);
    return 'twilio';
  }

  const { data: configs } = await service
    .from('integration_configs').select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['whatsapp_cloud', 'twilio'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true }).limit(1);

  const cfg = configs?.[0];
  if (cfg?.provider === 'whatsapp_cloud') { await sendViaWhatsAppCloud(cfg.config, normalized, renderedBody); return 'whatsapp_cloud'; }
  if (cfg?.provider === 'twilio')         { await sendViaTwilio(cfg.config, normalized, renderedBody);        return 'twilio'; }

  if (process.env.WA_PHONE_NUMBER_ID && process.env.WA_TOKEN) {
    await sendViaWhatsAppCloud({}, normalized, renderedBody);
    return 'whatsapp_cloud_env';
  }

  throw new Error('No WhatsApp provider configured. Add settings in Admin → Integrations.');
}

// ── Transport helpers — identical to fire.ts ────────────────────────────────
function buildMetaBodyParams(templateBody: string, vars: Record<string, any>): Array<{ type: 'text'; text: string }> {
  const seen = new Set<string>(); const order: string[] = [];
  templateBody.replace(/\{\{(\w+)\}\}/g, (_, key: string) => { if (!seen.has(key)) { seen.add(key); order.push(key); } return ''; });
  return order.map(key => ({ type: 'text' as const, text: String(vars[key] ?? '') }));
}

async function sendViaSMTP(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const nodemailer = await import('nodemailer');
  const host = config.smtpHost ?? config.host ?? process.env.SMTP_HOST;
  const user = config.smtpUser ?? config.user ?? process.env.SMTP_USER;
  const pass = config.smtpPass ?? config.password ?? process.env.SMTP_PASSWORD;
  const port = Number(config.smtpPort ?? config.port ?? process.env.SMTP_PORT ?? 587);
  if (!host || !user) throw new Error(`SMTP not configured (host=${host}, user=${user})`);
  console.log(`[sendViaSMTP] host=${host} port=${port} user=${user} to=${to}`);
  const t = nodemailer.default.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  await t.sendMail({
    from: `${config.fromName ?? config.from_name ?? 'Thynk Success'} <${config.fromEmail ?? config.from_email ?? process.env.SMTP_FROM ?? user}>`,
    to, subject,
    html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
  });
}

async function sendViaSendGrid(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const apiKey = config.api_key ?? process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SendGrid API key not configured');
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
  if (!res.ok) { const e = await res.text(); throw new Error(`SendGrid ${res.status}: ${e}`); }
}

async function sendViaSES(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({
    region: config.region ?? process.env.AWS_SES_REGION ?? 'us-east-1',
    credentials: config.access_key_id ? { accessKeyId: config.access_key_id, secretAccessKey: config.secret_access_key ?? process.env.AWS_SES_SECRET } : undefined,
  });
  await client.send(new SendEmailCommand({
    Source: `${config.from_name ?? 'Thynk Success'} <${config.from_email ?? process.env.AWS_SES_FROM}>`,
    Destination: { ToAddresses: [to] },
    Message: { Subject: { Data: subject }, Body: { Html: { Data: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>` } } },
  }));
}

async function sendViaWhatsAppCloud(config: any, phone: string, body: string) {
  const phoneNumberId = config.phone_number_id ?? process.env.WA_PHONE_NUMBER_ID;
  const token         = config.token            ?? process.env.WA_TOKEN;
  if (!phoneNumberId || !token) throw new Error('WhatsApp Cloud API not configured');
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.startsWith('91') ? phone : `91${phone}`, type: 'text', text: { body } }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`WhatsApp Cloud: ${JSON.stringify(e)}`); }
}

async function sendViaTwilio(config: any, phone: string, body: string) {
  const accountSid = config.account_sid   ?? process.env.TWILIO_ACCOUNT_SID;
  const authToken  = config.auth_token    ?? process.env.TWILIO_AUTH_TOKEN;
  const from       = config.whatsapp_from ?? process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) throw new Error('Twilio not configured');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: `whatsapp:+${from}`, To: `whatsapp:+${phone.startsWith('91') ? phone : '91' + phone}`, Body: body }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio error: ${res.status}`);
}
