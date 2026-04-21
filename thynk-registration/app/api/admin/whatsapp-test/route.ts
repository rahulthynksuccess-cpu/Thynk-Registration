export const dynamic = 'force-dynamic';
/**
 * WhatsApp send test — calls ThynkComm directly from the server.
 *
 * Plain text:  GET /api/admin/whatsapp-test?phone=918800903318
 * Template:    GET /api/admin/whatsapp-test?phone=918800903318&template=thynk_reg_school_registration
 * Custom lang: GET /api/admin/whatsapp-test?phone=918800903318&template=thynk_reg_school_registration&lang=en_US
 *
 * Response includes payload_sent so you can see exactly what was sent.
 * DELETE THIS FILE after testing — no auth check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);

  const rawPhone     = (searchParams.get('phone')    ?? '').replace(/\D/g, '');
  const templateName = (searchParams.get('template') ?? '').trim();
  const langCode     = (searchParams.get('lang')     ?? 'en_US').trim();

  if (!rawPhone) {
    return NextResponse.json({
      error: 'Pass ?phone=918800903318',
      tip:   'Add &template=thynk_reg_school_registration to test an approved Meta template',
    }, { status: 400 });
  }

  const to = rawPhone.startsWith('91') ? rawPhone : `91${rawPhone}`;

  const { data: platformRow, error: cfgErr } = await supabase
    .from('integration_configs')
    .select('config')
    .eq('provider', 'platform_settings')
    .is('school_id', null)
    .maybeSingle();

  if (cfgErr) return NextResponse.json({ error: 'DB error: ' + cfgErr.message }, { status: 500 });

  const wa = platformRow?.config?.whatsapp_settings;
  if (!wa)         return NextResponse.json({ error: 'No whatsapp_settings in DB' }, { status: 400 });
  if (!wa.tcUrl)   return NextResponse.json({ error: 'ThynkComm URL missing'     }, { status: 400 });
  if (!wa.tcApiKey)return NextResponse.json({ error: 'ThynkComm API key missing' }, { status: 400 });

  const payload = templateName
    ? { to, template_name: templateName, language_code: langCode }
    : { to, message: `Thynk test ${new Date().toISOString()}` };

  let httpStatus = 0;
  let responseBody: any = {};

  try {
    const res = await fetch(wa.tcUrl.replace(/\/$/, '') + '/api/send-message', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    wa.tcApiKey,
        'x-api-secret': wa.tcApiSecret ?? '',
      },
      body: JSON.stringify(payload),
    });
    httpStatus   = res.status;
    responseBody = await res.json().catch(() => ({}));
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, payload_sent: payload }, { status: 502 });
  }

  return NextResponse.json({
    success:      httpStatus === 200 && responseBody.success === true,
    http_status:  httpStatus,
    payload_sent: payload,
    response:     responseBody,
  });
}
