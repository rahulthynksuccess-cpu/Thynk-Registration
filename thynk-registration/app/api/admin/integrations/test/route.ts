import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { provider, config, to } = await req.json();

  try {
    if (provider === 'sendgrid') {
      const apiKey = config.api_key ?? process.env.SENDGRID_API_KEY;
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: config.from_email, name: config.from_name ?? 'Thynk' },
          subject: 'Thynk — Integration test',
          content: [{ type: 'text/plain', value: 'Your SendGrid integration is working!' }],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid: ${res.status}`);
      return NextResponse.json({ success: true, message: `Test email sent to ${to}` });
    }

    if (provider === 'whatsapp_cloud') {
      const phoneNumberId = config.phone_number_id ?? process.env.WA_PHONE_NUMBER_ID;
      const token         = config.token            ?? process.env.WA_TOKEN;
      const phone = to.replace(/\D/g, '');
      const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.startsWith('91') ? phone : `91${phone}`, type: 'text', text: { body: 'Thynk WhatsApp integration test ✅' } }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
      return NextResponse.json({ success: true, message: `Test WhatsApp sent to ${to}` });
    }

    if (provider === 'razorpay') {
      const creds = Buffer.from(`${config.rzp_key_id ?? process.env.RAZORPAY_KEY_ID}:${config.rzp_key_secret ?? process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST', headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100, currency: 'INR', receipt: 'test_check' }),
      });
      if (!res.ok) throw new Error(`Razorpay credentials invalid`);
      return NextResponse.json({ success: true, message: 'Razorpay credentials valid ✅' });
    }

    return NextResponse.json({ error: 'Test not supported for this provider' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
