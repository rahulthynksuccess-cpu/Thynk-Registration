/**
 * POST /api/admin/broadcast
 * Body: { channel, template_id, school_ids, recipients, student_ids?, smtp_config_id? }
 * Returns: { sent, failed, skipped, total, results }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/triggers/fire';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

async function sendWA(service: any, phone: string, body: string, schoolId: string): Promise<string> {
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();
  const wa = platformRow?.config?.whatsapp_settings;
  const normalized = phone.replace(/\D/g, '');
  const to = normalized.startsWith('91') ? normalized : `91${normalized}`;
  if (wa?.provider === 'thynkcomm' && wa?.tcUrl && wa?.tcApiKey) {
    const res = await fetch(wa.tcUrl.replace(/\/$/, '') + '/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
      body: JSON.stringify({ to, message: body }),
    });
    if (!res.ok) throw new Error(`ThynkComm: ${res.status}`);
    return 'thynkcomm';
  }
  if (wa?.provider === 'meta' && wa?.metaPhoneId && wa?.metaToken) {
    const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) throw new Error(`Meta: ${res.status}`);
    return 'meta_whatsapp';
  }
  if (wa?.provider === 'twilio' && wa?.accountSid && wa?.authToken && wa?.fromNumber) {
    const creds = Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64');
    const from  = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio: ${res.status}`);
    return 'twilio';
  }
  throw new Error('No WhatsApp provider configured');
}

async function sendEmail(
  service: any, to: string, subject: string, body: string,
  schoolId: string, smtpConfigId?: string
): Promise<string> {
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();
  const smtpConfigs: any[] = platformRow?.config?.email_smtp_configs ?? [];
  let smtpCfg: any = null;

  if (smtpConfigId && smtpConfigId !== 'default') {
    // User explicitly chose a config by id or smtpUser
    smtpCfg = smtpConfigs.find((c: any) => c.id === smtpConfigId || c.smtpUser === smtpConfigId);
  }
  if (!smtpCfg && smtpConfigs.length > 0) {
    const { data: school } = await service.from('schools').select('project_id').eq('id', schoolId).single();
    const pid = school?.project_id ?? null;
    if (pid) smtpCfg = smtpConfigs.find((c: any) => c.enabled !== false && c.program_id === pid);
    if (!smtpCfg) smtpCfg = smtpConfigs.find((c: any) => c.enabled !== false && (!c.program_id || c.program_id === ''));
    if (!smtpCfg) smtpCfg = smtpConfigs.find((c: any) => c.enabled !== false);
  }
  if (!smtpCfg) smtpCfg = platformRow?.config?.email_settings;
  if (!smtpCfg?.smtpHost) throw new Error('No email provider configured');

  const nodemailer = await import('nodemailer');
  const t = nodemailer.default.createTransport({
    host: smtpCfg.smtpHost, port: Number(smtpCfg.smtpPort ?? 587),
    secure: Number(smtpCfg.smtpPort ?? 587) === 465,
    auth: { user: smtpCfg.smtpUser, pass: smtpCfg.smtpPass },
  });
  await t.sendMail({
    from: `${smtpCfg.fromName ?? 'Thynk'} <${smtpCfg.fromEmail ?? smtpCfg.smtpUser}>`,
    to, subject,
    html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br>')}</p>`,
  });
  return `smtp:${smtpCfg.name || smtpCfg.smtpUser}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { channel, template_id, school_ids, recipients, student_ids, smtp_config_id } = await req.json();
  if (!channel || !template_id || !school_ids?.length || !recipients?.length)
    return NextResponse.json({ error: 'channel, template_id, school_ids and recipients required' }, { status: 400 });

  const service = createServiceClient();
  const { data: template } = await service.from('notification_templates').select('*').eq('id', template_id).single();
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const { data: schools } = await service
    .from('schools').select('*, projects(name,slug)')
    .in('id', school_ids).eq('is_active', true);
  if (!schools?.length) return NextResponse.json({ error: 'No active schools found' }, { status: 404 });

  // Load students — filter by student_ids if provided (user deselected some)
  // If student_ids is an empty array it means the user deselected all — send to none
  let studentMap: Record<string, any[]> = {};
  if (recipients.includes('students')) {
    // Empty array = user explicitly removed all students — skip entirely
    if (Array.isArray(student_ids) && student_ids.length === 0) {
      console.log('[broadcast] student_ids is empty array — skipping all students');
    } else {
      let q = service.from('registrations')
        .select('id,student_name,contact_phone,contact_email,school_id,class_grade,gender,parent_name,discount_code,base_amount,final_amount')
        .in('school_id', school_ids);
      if (student_ids?.length) q = q.in('id', student_ids);
      const { data: regs, error: regsErr } = await q;
      if (regsErr) console.error('[broadcast] registrations query error:', regsErr.message);
      if (regs) {
        for (const r of regs) {
          if (!studentMap[r.school_id]) studentMap[r.school_id] = [];
          studentMap[r.school_id].push(r);
        }
        console.log(`[broadcast] Loaded ${regs.length} students across ${Object.keys(studentMap).length} schools`);
      }
    }
  }

  type Item = { name:string; type:string; recipient:string; status:'sent'|'failed'|'skipped'; error?:string };
  const results: Item[] = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const school of schools) {
    const contact     = school.contact_persons?.[0];
    const programName = (school as any).projects?.name ?? '';
    const baseVars = {
      school_name: school.name??'', program_name: programName,
      city: school.city??'', state: school.state??'', org_name: 'Thynk Success',
      contact_person_name: contact?.name??'', contact_designation: contact?.designation??'',
      contact_phone: contact?.mobile??'', contact_email: contact?.email??'',
    };

    if (recipients.includes('schools') && contact) {
      const vars    = { ...baseVars, student_name: contact.name, parent_name: contact.name };
      const body    = renderTemplate(template.body, vars);
      const subject = renderTemplate(template.subject ?? 'Message from Thynk', vars);
      let status: 'sent'|'failed'|'skipped' = 'skipped'; let err = ''; let prov = '';
      try {
        if (channel === 'email') {
          if (!contact.email) { status='skipped'; err='No email'; }
          else { prov = await sendEmail(service, contact.email, subject, body, school.id, smtp_config_id); status='sent'; }
        } else {
          if (!contact.mobile) { status='skipped'; err='No phone'; }
          else { prov = await sendWA(service, contact.mobile, body, school.id); status='sent'; }
        }
      } catch(e:any) { status='failed'; err=e.message; }
      status==='sent'?sent++:status==='failed'?failed++:skipped++;
      results.push({ name:school.name, type:'school', recipient:channel==='email'?(contact.email??'—'):(contact.mobile??'—'), status, error:err||undefined });
      await service.from('notification_logs').insert({ school_id:school.id, channel, provider:prov||'broadcast', recipient:channel==='email'?(contact.email??''):(contact.mobile??''), status, sent_at:status==='sent'?new Date().toISOString():undefined });
    }

    if (recipients.includes('students')) {
      for (const s of (studentMap[school.id]??[])) {
        const vars = { ...baseVars, student_name:s.student_name??'', parent_name:s.parent_name??'', class_grade:s.class_grade??'', gender:s.gender??'', registration_id:s.id??'', discount_code:s.discount_code??'', contact_email:s.contact_email??'', contact_phone:s.contact_phone??'', base_amount:s.base_amount?String(s.base_amount/100):'', final_amount:s.final_amount?String(s.final_amount/100):'' };
        const body    = renderTemplate(template.body, vars);
        const subject = renderTemplate(template.subject ?? 'Message from Thynk', vars);
        let status:'sent'|'failed'|'skipped'='skipped'; let err=''; let prov='';
        try {
          if (channel === 'email') {
            if (!s.contact_email) { status='skipped'; err='No email address'; }
            else { prov = await sendEmail(service, s.contact_email, subject, body, school.id, smtp_config_id); status='sent'; }
          } else {
            if (!s.contact_phone) { status='skipped'; err='No phone number'; }
            else { prov = await sendWA(service, s.contact_phone, body, school.id); status='sent'; }
          }
        } catch(e:any) {
          status='failed'; err=e.message;
          console.error(`[broadcast] student ${s.student_name} (${s.id}) ${channel} failed:`, e.message);
        }
        status==='sent'?sent++:status==='failed'?failed++:skipped++;
        results.push({ name:s.student_name??'—', type:'student', recipient:channel==='email'?(s.contact_email??'—'):(s.contact_phone??'—'), status, error:err||undefined });
        await service.from('notification_logs').insert({ school_id:school.id, registration_id:s.id, channel, provider:prov||'broadcast', recipient:channel==='email'?(s.contact_email??''):(s.contact_phone??''), status, sent_at:status==='sent'?new Date().toISOString():undefined });
      }
    }
  }

  return NextResponse.json({ sent, failed, skipped, total: results.length, results });
}
