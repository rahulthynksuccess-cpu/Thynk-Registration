/**
 * GET /api/admin/whatsapp-test?phone=919876543210
 *
 * Tests WhatsApp config end-to-end from the SERVER side and returns the exact error.
 * Super-admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const phone = (searchParams.get('phone') ?? '').replace(/\D/g, '');

  if (!phone) return NextResponse.json({ error: 'Pass ?phone=919876543210' }, { status: 400 });

  // Load platform_settings
  const { data: platformRow, error: cfgErr } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();

  if (cfgErr) return NextResponse.json({ step: 'load_config', error: cfgErr.message });

  const wa = platformRow?.config?.whatsapp_settings;

  if (!wa) return NextResponse.json({
    step: 'load_config',
    error: 'No whatsapp_settings found in platform_settings. Go to Admin → Settings → WhatsApp and save your config.',
    raw_config: platformRow?.config ?? null,
  });

  const result: any = {
    provider: wa.provider,
    enabled: wa.enabled,
    to: phone.startsWith('91') ? phone : `91${phone}`,
  };

  const to = phone.startsWith('91') ? phone : `91${phone}`;
  const testMsg = `Thynk WhatsApp test from server at ${new Date().toISOString()}`;

  try {
    if (wa.provider === 'thynkcomm') {
      result.config_present = { tcUrl: !!wa.tcUrl, tcApiKey: !!wa.tcApiKey, tcApiSecret: !!wa.tcApiSecret };
      if (!wa.tcUrl || !wa.tcApiKey) throw new Error(`Missing: tcUrl=${!!wa.tcUrl}, tcApiKey=${!!wa.tcApiKey}`);
      const url = wa.tcUrl.replace(/\/$/, '') + '/api/send-message';
      result.url = url;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
        body: JSON.stringify({ to, message: testMsg }),
      });
      const body = await res.json().catch(() => res.text());
      result.http_status = res.status;
      result.response = body;
      result.success = res.ok;
      if (!res.ok) throw new Error(`ThynkComm HTTP ${res.status}: ${JSON.stringify(body)}`);

    } else if (wa.provider === 'meta') {
      result.config_present = { metaPhoneId: !!wa.metaPhoneId, metaToken: !!wa.metaToken };
      if (!wa.metaPhoneId || !wa.metaToken) throw new Error(`Missing: metaPhoneId=${!!wa.metaPhoneId}, metaToken=${!!wa.metaToken}`);
      const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: testMsg } }),
      });
      const body = await res.json().catch(() => res.text());
      result.http_status = res.status;
      result.response = body;
      result.success = res.ok;
      if (!res.ok) throw new Error(`Meta HTTP ${res.status}: ${JSON.stringify(body)}`);

    } else if (wa.provider === 'twilio') {
      result.config_present = { accountSid: !!wa.accountSid, authToken: !!wa.authToken, fromNumber: !!wa.fromNumber };
      if (!wa.accountSid || !wa.authToken || !wa.fromNumber) throw new Error(`Missing Twilio config`);
      const from = wa.fromNumber.startsWith('whatsapp:') ? wa.fromNumber : `whatsapp:${wa.fromNumber}`;
      const creds = Buffer.from(`${wa.accountSid}:${wa.authToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: testMsg }).toString(),
      });
      const body = await res.json().catch(() => res.text());
      result.http_status = res.status;
      result.response = body;
      result.success = res.ok;
      if (!res.ok) throw new Error(`Twilio HTTP ${res.status}: ${JSON.stringify(body)}`);

    } else {
      throw new Error(`Unknown provider: "${wa.provider}". Must be thynkcomm, meta, or twilio.`);
    }
  } catch (err: any) {
    result.success = false;
    result.error = err.message;
  }

  return NextResponse.json(result);
}
