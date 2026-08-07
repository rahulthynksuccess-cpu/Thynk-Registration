/**
 * GET /api/admin/broadcast/config
 * Returns available SMTP configs (no passwords) and WhatsApp provider info
 * so the frontend can let the user pick which sender to use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { data: platformRow } = await service
    .from('integration_configs').select('config')
    .eq('provider', 'platform_settings').is('school_id', null).maybeSingle();

  const rawSmtp: any[] = platformRow?.config?.email_smtp_configs ?? [];
  // Strip passwords before sending to client
  const smtpConfigs = rawSmtp
    .filter((c: any) => c.enabled !== false)
    .map((c: any) => ({
      id:        c.id        ?? c.smtpUser,
      name:      c.name      || c.smtpUser || 'Default SMTP',
      fromName:  c.fromName  || 'Thynk',
      fromEmail: c.fromEmail || c.smtpUser || '',
      smtpUser:  c.smtpUser  || '',
      program_id: c.program_id || null,
    }));

  // Also expose legacy single smtp config if no multi-configs
  if (smtpConfigs.length === 0 && platformRow?.config?.email_settings?.smtpHost) {
    const es = platformRow.config.email_settings;
    smtpConfigs.push({
      id:        'default',
      name:      'Default SMTP',
      fromName:  es.fromName  || 'Thynk',
      fromEmail: es.fromEmail || es.smtpUser || '',
      smtpUser:  es.smtpUser  || '',
      program_id: null,
    });
  }

  const wa = platformRow?.config?.whatsapp_settings;
  const whatsappProvider = wa?.provider
    ? { provider: wa.provider, label: wa.provider === 'thynkcomm' ? 'ThynkComm' : wa.provider === 'meta' ? 'Meta WhatsApp' : wa.provider }
    : null;

  return NextResponse.json({ smtpConfigs, whatsappProvider });
}
