export const dynamic = 'force-dynamic';
/**
 * GET /api/admin/whatsapp-test?phone=919876543210
 * Temporary debug endpoint - NO AUTH - DELETE AFTER TESTING
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const phone = (searchParams.get('phone') ?? '').replace(/\D/g, '');

  if (!phone) return NextResponse.json({ error: 'Pass ?phone=919876543210' }, { status: 400 });

  const to = phone.startsWith('91') ? phone : `91${phone}`;

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
    error: 'No whatsapp_settings found. Go to Admin → Settings → WhatsApp and save.',
    raw_config_keys: Object.keys(platformRow?.config ?? {}),
  });

  const testMsg = `Thynk WhatsApp server test ${new Date().toISOString()}`;
  const result: any = { provider: wa.provider, enabled: wa.enabled, to };

  try {
    if (wa.provider === 'thynkcomm') {
      result.config = { tcUrl: wa.tcUrl, hasApiKey: !!wa.tcApiKey, hasSecret: !!wa.tcApiSecret };
      if (!wa.tcUrl || !wa.tcApiKey) throw new Error(`Missing tcUrl or tcApiKey`);
      const url = wa.tcUrl.replace(/\/$/, '') + '/api/send-message';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': wa.tcApiKey, 'x-api-secret': wa.tcApiSecret ?? '' },
        body: JSON.stringify({ to, message: testMsg }),
      });
      const body = await res.json().catch(() => res.text());
      result.http_status = res.status;
      result.response = body;
      result.success = res.ok;

    } else if (wa.provider === 'meta') {
      result.config = { metaPhoneId: wa.metaPhoneId, hasToken: !!wa.metaToken };
      if (!wa.metaPhoneId || !wa.metaToken) throw new Error(`Missing metaPhoneId or metaToken`);
      const res = await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${wa.metaToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: testMsg } }),
      });
      const body = await res.json().catch(() => res.text());
      result.http_status = res.status;
      result.response = body;
      result.success = res.ok;

    } else if (wa.provider === 'twilio') {
      result.config = { hasAccountSid: !!wa.accountSid, hasAuthToken: !!wa.authToken, fromNumber: wa.fromNumber };
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

    } else {
      throw new Error(`Unknown provider: "${wa.provider}"`);
    }
  } catch (err: any) {
    result.success = false;
    result.error = err.message;
  }

  return NextResponse.json(result);
}
