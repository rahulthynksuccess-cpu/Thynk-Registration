/**
 * app/api/admin/leads/campaigns/route.ts
 *
 * POST  — create a campaign + bulk-send + save per-recipient logs
 * GET   — list campaigns with summary stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/triggers/fire';

async function getAdminCtx(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data: roles } = await service
    .from('admin_roles').select('role,school_id,all_schools').eq('user_id', user.id);
  return { user, service, roles: roles ?? [] };
}

// ── Helpers (mirrors send/route.ts exactly) ───────────────────────────────────
async function dispatchEmail(service: any, schoolId: string, to: string, subject: string, body: string, smtpConfigId?: string) {
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();

  const smtpConfigs: any[] = platformRow?.config?.email_smtp_configs ?? [];
  let smtpCfg: any = null;

  if (smtpConfigId) smtpCfg = smtpConfigs.find((c: any) => c.id === smtpConfigId || c.smtpUser === smtpConfigId);
  if (!smtpCfg) smtpCfg = smtpConfigs.find((c: any) => c.enabled && (!c.program_id || c.program_id === ''));
  if (!smtpCfg) smtpCfg = smtpConfigs.find((c: any) => c.enabled);

  if (!smtpCfg?.smtpHost) throw new Error('No SMTP configured');

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: smtpCfg.smtpHost, port: parseInt(smtpCfg.smtpPort ?? '587'),
    secure: smtpCfg.smtpSecure === true || smtpCfg.smtpPort === '465',
    auth: { user: smtpCfg.smtpUser, pass: smtpCfg.smtpPass },
  });
  await transporter.sendMail({
    from: `"${smtpCfg.fromName || 'Thynk'}" <${smtpCfg.fromEmail || smtpCfg.smtpUser}>`,
    to, subject, html: body,
  });
  return `smtp:${smtpCfg.name || smtpCfg.smtpUser}`;
}

async function dispatchWhatsApp(service: any, phone: string, templateBody: string, templateObj: any, vars: Record<string, any>) {
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();
  const wa = platformRow?.config?.whatsapp_settings;

  const normalized = phone.replace(/\D/g, '');
  const to = normalized.startsWith('91') ? normalized : `91${normalized}`;
  const body = renderTemplate(templateBody, vars);

  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const templateName = templateObj?.whatsapp_template_name;
    const payload = templateName
      ? { to, template_name: templateName, language_code: (templateObj?.whatsapp_template_lang ?? 'en_US'), }
      : { to, message: body };
    const res = await fetch(wa.tcUrl.replace(/\/$/, '') + '/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`ThynkComm: ${e.error ?? res.status}`); }
    return 'thynkcomm';
  }

  if (wa?.provider === 'meta' || wa?.phone_number_id) {
    const res = await fetch(`https://graph.facebook.com/v18.0/${wa.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Meta: ${JSON.stringify(e)}`); }
    return 'meta';
  }

  throw new Error('WhatsApp provider not configured');
}

// ── GET — list campaigns ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getAdminCtx(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { service } = ctx;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

  const { data, error } = await service
    .from('lead_broadcast_campaigns')
    .select('*, schools(name), projects(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

// ── POST — bulk send + create campaign record ─────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getAdminCtx(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, service } = ctx;
  const body = await req.json();
  const { channel, template_id, lead_ids, smtp_config_id, filters = {} } = body;

  if (!channel || !template_id || !Array.isArray(lead_ids) || !lead_ids.length)
    return NextResponse.json({ error: 'channel, template_id and lead_ids required' }, { status: 400 });

  // Fetch template
  const { data: template, error: tErr } = await service
    .from('notification_templates').select('*').eq('id', template_id).single();
  if (tErr || !template)
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  // Fetch leads with school info
  const { data: leads, error: lErr } = await service
    .from('lead_database')
    .select('*, schools(id,name,school_code,project_id)')
    .in('id', lead_ids);
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  // Derive campaign school_id (single school or null for multi)
  const uniqueSchools = [...new Set((leads ?? []).map((l: any) => l.school_id))];
  const campaignSchoolId = uniqueSchools.length === 1 ? uniqueSchools[0] : null;

  // Create campaign record
  const { data: campaign, error: cErr } = await service
    .from('lead_broadcast_campaigns')
    .insert({
      name: `Lead Broadcast · ${channel === 'email' ? '✉️' : '💬'} ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      channel, template_id, template_name: template.name,
      smtp_config_id: smtp_config_id ?? null,
      school_id: campaignSchoolId,
      filters,
      total: leads?.length ?? 0,
      created_by: user.id,
    })
    .select().single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // ── Send to each lead ──────────────────────────────────────────────────────
  let sent = 0, failed = 0, skipped = 0;
  const logRows: any[] = [];

  for (const lead of leads ?? []) {
    const vars = {
      student_name: lead.student_name ?? '',
      parent_name:  lead.parent_name  ?? '',
      grade:        lead.grade        ?? '',
      mobile:       lead.mobile       ?? '',
      email:        lead.email        ?? '',
      school_name:  lead.schools?.name ?? '',
    };
    const renderedBody    = renderTemplate(template.body, vars);
    const renderedSubject = template.subject
      ? renderTemplate(template.subject, vars)
      : `Message from ${vars.school_name || 'Thynk'}`;

    const recipient = channel === 'email' ? lead.email : lead.mobile;

    if (!recipient) {
      skipped++;
      logRows.push({
        campaign_id: campaign.id, lead_id: lead.id, school_id: lead.school_id,
        channel, recipient: null, student_name: lead.student_name,
        status: 'skipped', error: `No ${channel === 'email' ? 'email' : 'phone'} address`,
      });
      continue;
    }

    try {
      let provider = '';
      if (channel === 'email') {
        provider = await dispatchEmail(service, lead.school_id, recipient, renderedSubject, renderedBody, smtp_config_id);
      } else {
        provider = await dispatchWhatsApp(service, recipient, template.body, template, vars);
      }
      sent++;
      logRows.push({
        campaign_id: campaign.id, lead_id: lead.id, school_id: lead.school_id,
        channel, recipient, student_name: lead.student_name,
        status: 'sent', provider, sent_at: new Date().toISOString(),
      });
    } catch (e: any) {
      failed++;
      logRows.push({
        campaign_id: campaign.id, lead_id: lead.id, school_id: lead.school_id,
        channel, recipient, student_name: lead.student_name,
        status: 'failed', error: e.message,
      });
    }
  }

  // Save logs in bulk
  if (logRows.length) await service.from('lead_broadcast_logs').insert(logRows);

  // Update campaign totals
  await service.from('lead_broadcast_campaigns')
    .update({ sent, failed, skipped })
    .eq('id', campaign.id);

  return NextResponse.json({
    campaign_id: campaign.id,
    total: leads?.length ?? 0,
    sent, failed, skipped,
    results: logRows.map(r => ({ name: r.student_name, recipient: r.recipient, status: r.status, error: r.error })),
  });
}
