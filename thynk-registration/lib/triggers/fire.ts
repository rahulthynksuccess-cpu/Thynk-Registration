import { createServiceClient } from '@/lib/supabase/server';
import type { TriggerEvent, TemplateVars } from '@/lib/types';

/**
 * IMPORTANT: Always AWAIT this function. Do NOT use `void fireTriggers(...)`.
 * On Vercel serverless, unawaited promises are killed when the response is sent.
 */
export async function fireTriggers(
  event: TriggerEvent,
  registrationId: string,
  schoolId: string
): Promise<void> {
  const supabase = createServiceClient();
  const tag = `[fireTriggers:${event}]`;

  console.log(`${tag} START — schoolId=${schoolId} registrationId=${registrationId}`);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`${tag} FATAL: SUPABASE_SERVICE_ROLE_KEY env var is not set!`);
    return;
  }

  // ── Load triggers ─────────────────────────────────────────────────────────
  const { data: triggers, error: triggerErr } = await supabase
    .from('notification_triggers')
    .select('*, notification_templates(*)')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .eq('event_type', event)
    .eq('is_active', true);

  if (triggerErr) {
    console.error(`${tag} DB error loading triggers:`, triggerErr.message, triggerErr.code);
    return;
  }

  if (!triggers?.length) {
    const { data: allTriggers } = await supabase
      .from('notification_triggers')
      .select('id, event_type, school_id, is_active');
    console.warn(
      `${tag} No triggers found for event=${event} school=${schoolId}.\n` +
      `  All triggers: ${JSON.stringify(allTriggers?.map(t => ({ event_type: t.event_type, school_id: t.school_id, is_active: t.is_active })))}`
    );
    return;
  }

  console.log(`${tag} Found ${triggers.length} trigger(s):`, triggers.map(t =>
    `${t.id} channel=${t.channel} recipient_type=${t.recipient_type ?? 'student'}`
  ));

  // ── Build vars ────────────────────────────────────────────────────────────
  // For school events: only school vars needed.
  // For registration/payment events: build student vars always,
  // and school vars too (used when recipient_type='school').
  let studentVars: TemplateVars | null = null;
  let schoolVars: TemplateVars | null = null;

  if (event === 'school.approved' || event === 'school.registered') {
    schoolVars = await buildSchoolVars(schoolId);
    if (!schoolVars) {
      console.error(`${tag} Could not build school vars — schoolId=${schoolId}`);
      return;
    }
  } else {
    studentVars = await buildTemplateVars(registrationId, schoolId, event);
    if (!studentVars) {
      console.error(`${tag} Could not build student vars — regId=${registrationId}`);
      return;
    }
    // Also load school contact details for triggers with recipient_type='school'
    schoolVars = await buildSchoolVars(schoolId);
  }

  // ── Fire each trigger ─────────────────────────────────────────────────────
  for (const trigger of triggers) {
    const template = trigger.notification_templates;
    const recipientType: 'student' | 'school' = trigger.recipient_type ?? 'student';

    if (!template) {
      console.error(`${tag} trigger ${trigger.id} has no linked template — skipping`);
      continue;
    }
    if (!template.is_active) {
      console.warn(`${tag} template "${template.name}" is_active=false — skipping`);
      continue;
    }

    // Pick the correct vars based on recipient_type:
    // 'school'  → contact_email/phone comes from schools.contact_persons[0]
    // 'student' → contact_email/phone comes from registrations row
    let vars: TemplateVars | null = null;

    if (event === 'school.approved' || event === 'school.registered') {
      vars = schoolVars;
    } else if (recipientType === 'school') {
      if (studentVars && schoolVars) {
        // Merge: body placeholders like {{student_name}} still work,
        // but the recipient (contact_email/phone) is the school coordinator.
        vars = {
          ...studentVars,
          contact_email:       schoolVars.contact_email,
          contact_phone:       schoolVars.contact_phone,
          contact_person_name: schoolVars.contact_person_name,
          contact_designation: schoolVars.contact_designation,
        };
      } else if (studentVars) {
        console.warn(`${tag} recipient_type=school but school vars unavailable — falling back to student`);
        vars = studentVars;
      }
    } else {
      vars = studentVars;
    }

    if (!vars) {
      console.error(`${tag} No vars for trigger ${trigger.id} — skipping`);
      continue;
    }

    const recipient = trigger.channel === 'email'
      ? (vars.contact_email ?? '').toLowerCase().trim()
      : (vars.contact_phone ?? '');

    if (!recipient) {
      console.error(
        `${tag} Empty recipient for channel=${trigger.channel} recipient_type=${recipientType}` +
        ` contact_email="${vars.contact_email}" contact_phone="${vars.contact_phone}" — skipping`
      );
      continue;
    }

    console.log(`${tag} Sending ${trigger.channel} → ${recipient} (recipient_type=${recipientType})`);

    const logEntry: {
      registration_id: string | null;
      school_id: string;
      trigger_id: string;
      channel: string;
      provider: string;
      recipient: string;
      status: 'pending' | 'sent' | 'failed';
    } = {
      registration_id: registrationId || null,
      school_id: schoolId,
      trigger_id: trigger.id,
      channel: trigger.channel,
      provider: '',
      recipient,
      status: 'pending',
    };

    let lastError: string | null = null;
    try {
      if (trigger.channel === 'email') {
        const provider = await sendEmail(template, vars, schoolId);
        logEntry.provider = provider;
        logEntry.status = 'sent';
        console.log(`${tag} ✅ email sent via ${provider} to ${recipient}`);
      } else if (trigger.channel === 'whatsapp') {
        const provider = await sendWhatsApp(template, vars, schoolId);
        logEntry.provider = provider;
        logEntry.status = 'sent';
        console.log(`${tag} ✅ whatsapp sent via ${provider} to ${recipient}`);
      }
    } catch (err: any) {
      lastError = err?.message ?? 'unknown error';
      logEntry.status = 'failed';
      logEntry.provider = logEntry.provider || 'unknown';
      console.error(`${tag} ❌ FAILED ${trigger.channel} to ${recipient}: ${lastError}`);
    }

    const { error: logErr } = await supabase.from('notification_logs').insert({
      ...logEntry,
      sent_at: logEntry.status === 'sent' ? new Date().toISOString() : null,
      provider_response: logEntry.status === 'failed' ? { error: lastError } : null,
    });
    if (logErr) console.error(`${tag} Failed to write notification_log: ${logErr.message}`);
  }

  console.log(`${tag} DONE`);
}

// ── School vars (school.registered / school.approved events) ─────────────────
async function buildSchoolVars(schoolId: string): Promise<TemplateVars | null> {
  const supabase = createServiceClient();
  const { data: school, error } = await supabase
    .from('schools')
    .select('name, org_name, city, country, contact_persons, school_code')
    .eq('id', schoolId)
    .single();

  if (error || !school) {
    console.error('[buildSchoolVars] Not found:', schoolId, error?.message);
    return null;
  }
  const primary = Array.isArray(school.contact_persons) ? school.contact_persons[0] : null;
  if (!primary) console.warn(`[buildSchoolVars] school ${schoolId} has no contact_persons`);

  return {
    school_name:         school.name     ?? '',
    org_name:            school.org_name ?? '',
    city:                school.city     ?? '',
    contact_email:       primary?.email?.toLowerCase().trim() ?? '',
    contact_phone:       primary?.mobile ?? '',
    contact_person_name: primary?.name        ?? '',
    contact_designation: primary?.designation ?? '',
  };
}

// ── Registration / payment vars ───────────────────────────────────────────────
async function buildTemplateVars(
  registrationId: string,
  schoolId: string,
  event: TriggerEvent
): Promise<TemplateVars | null> {
  const supabase = createServiceClient();
  const { data: reg, error } = await supabase
    .from('registrations')
    .select('*, schools(name, org_name), pricing(program_name), payments(gateway, gateway_txn_id, final_amount, paid_at, status, created_at)')
    .eq('id', registrationId)
    .single();

  if (error || !reg) {
    console.error('[buildTemplateVars] Not found:', registrationId, error?.message);
    return null;
  }

  const payments = (reg.payments ?? []).sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const payment = payments[0];
  const school  = reg.schools as any;
  const pricing = reg.pricing as any;

  let paymentLink = '';
  if (event !== 'payment.paid') {
    const { data: schoolData } = await supabase
      .from('schools')
      .select('school_code, project_slug')
      .eq('id', reg.school_id ?? schoolId)
      .single();
    if (schoolData?.project_slug && schoolData?.school_code) {
      paymentLink = `https://thynksuccess.com/registration/${schoolData.project_slug}/?school=${schoolData.school_code}`;
    }
  }

  return {
    student_name:  reg.student_name  ?? '',
    parent_name:   reg.parent_name   ?? '',
    contact_phone: reg.contact_phone ?? '',
    contact_email: (reg.contact_email ?? '').toLowerCase().trim(),
    class_grade:   reg.class_grade   ?? '',
    parent_school: reg.parent_school ?? '',
    city:          reg.city          ?? '',
    school_name:   school?.name      ?? '',
    org_name:      school?.org_name  ?? '',
    program_name:  pricing?.program_name ?? '',
    amount:        payment?.final_amount
      ? `₹${(payment.final_amount / 100).toLocaleString('en-IN')}` : undefined,
    txn_id:        payment?.gateway_txn_id ?? undefined,
    gateway:       payment?.gateway        ?? undefined,
    paid_at:       payment?.paid_at
      ? new Date(payment.paid_at).toLocaleDateString('en-IN') : undefined,
    payment_link:  paymentLink || undefined,
    retry_link:    paymentLink || undefined,
  } as TemplateVars;
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars as any)[key] ?? `{{${key}}}`);
}

// ── Email sender ──────────────────────────────────────────────────────────────
async function sendEmail(template: any, vars: TemplateVars, schoolId: string): Promise<string> {
  const supabase = createServiceClient();
  const subject  = template.subject ? renderTemplate(template.subject, vars) : `${vars.school_name} — Notification`;
  const body     = renderTemplate(template.body, vars);
  const to       = vars.contact_email ?? '';
  if (!to) throw new Error('contact_email is empty');

  const { data: platformRow } = await supabase
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();

  const smtpConfigs: any[] = platformRow?.config?.email_smtp_configs ?? [];
  console.log(`[sendEmail] smtp_configs count=${smtpConfigs.length} to=${to}`);

  if (smtpConfigs.length > 0) {
    let programId: string | null = null;
    if (schoolId) {
      const { data: school } = await supabase
        .from('schools').select('project_id').eq('id', schoolId).single();
      programId = school?.project_id ?? null;
    }

    let smtpCfg = programId
      ? smtpConfigs.find(c => c.enabled && c.program_id === programId)
      : null;
    if (!smtpCfg) smtpCfg = smtpConfigs.find(c => c.enabled && (!c.program_id || c.program_id === ''));
    if (!smtpCfg) smtpCfg = smtpConfigs.find(c => c.enabled);

    console.log(`[sendEmail] selected smtp=${smtpCfg?.smtpHost ?? 'none'} user=${smtpCfg?.smtpUser ?? 'none'}`);

    if (smtpCfg?.smtpHost && smtpCfg?.smtpUser && smtpCfg?.smtpPass) {
      await sendViaSMTP(smtpCfg, { to, subject, body });
      return `smtp:${smtpCfg.name || smtpCfg.smtpUser}`;
    }
    console.warn(`[sendEmail] smtp_configs exist but none have host+user+pass`);
  }

  const emailCfg = platformRow?.config?.email_settings;
  if (emailCfg?.smtpHost && emailCfg?.smtpUser) {
    console.log(`[sendEmail] using legacy email_settings smtp=${emailCfg.smtpHost}`);
    await sendViaSMTP(emailCfg, { to, subject, body });
    return 'smtp';
  }

  const { data: configs } = await supabase
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

// ── WhatsApp sender ───────────────────────────────────────────────────────────
async function sendWhatsApp(template: any, vars: TemplateVars, schoolId: string): Promise<string> {
  const supabase  = createServiceClient();
  const body      = renderTemplate(template.body, vars);
  const rawPhone  = vars.contact_phone ?? '';
  if (!rawPhone) throw new Error('contact_phone is empty');
  const phone = rawPhone.replace(/\D/g, '');

  const { data: platformRow } = await supabase
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();
  const wa = platformRow?.config?.whatsapp_settings;

  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const to  = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await fetch(wa.tcUrl.replace(/\/$/, '') + '/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
      body: JSON.stringify({ to, message: body }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`ThynkComm error: ${e.message ?? res.status}`); }
    return 'thynkcomm';
  }

  if (wa?.provider === 'meta' && wa?.metaPhoneId && wa?.metaToken) {
    const to  = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Meta WhatsApp error: ${JSON.stringify(e)}`); }
    return 'meta_whatsapp';
  }

  if (wa?.provider === 'twilio' && wa?.accountSid && wa?.authToken && wa?.fromNumber) {
    const to   = phone.startsWith('91') ? phone : `91${phone}`;
    const from = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
    const res  = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio platform error: ${res.status}`);
    return 'twilio';
  }

  const { data: configs } = await supabase
    .from('integration_configs').select('provider, config')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('provider', ['whatsapp_cloud', 'twilio'])
    .eq('is_active', true)
    .order('school_id', { nullsFirst: false })
    .order('priority', { ascending: true }).limit(1);

  const cfg = configs?.[0];
  if (cfg?.provider === 'whatsapp_cloud') { await sendViaWhatsAppCloud(cfg.config, phone, body); return 'whatsapp_cloud'; }
  if (cfg?.provider === 'twilio')         { await sendViaTwilio(cfg.config, phone, body);        return 'twilio'; }

  if (process.env.WA_PHONE_NUMBER_ID && process.env.WA_TOKEN) {
    await sendViaWhatsAppCloud({}, phone, body);
    return 'whatsapp_cloud_env';
  }

  throw new Error('No WhatsApp provider configured. Add settings in Admin → Integrations.');
}

// ── Transport helpers ─────────────────────────────────────────────────────────

async function sendViaSMTP(config: any, { to, subject, body }: { to: string; subject: string; body: string }) {
  const nodemailer = await import('nodemailer');
  const host = config.smtpHost ?? config.host ?? process.env.SMTP_HOST;
  const user = config.smtpUser ?? config.user ?? process.env.SMTP_USER;
  const pass = config.smtpPass ?? config.password ?? process.env.SMTP_PASSWORD;
  const port = Number(config.smtpPort ?? config.port ?? process.env.SMTP_PORT ?? 587);
  if (!host || !user) throw new Error(`SMTP not configured (host=${host}, user=${user})`);
  console.log(`[sendViaSMTP] host=${host} port=${port} user=${user} to=${to}`);
  const t = nodemailer.default.createTransport({
    host, port,
    secure: port === 465,
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
