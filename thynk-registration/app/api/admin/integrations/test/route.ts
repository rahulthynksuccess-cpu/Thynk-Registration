import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
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
      const keyId     = config.key_id     ?? process.env.RAZORPAY_KEY_ID;
      const keySecret = config.key_secret ?? process.env.RAZORPAY_KEY_SECRET;
      const creds = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST', headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100, currency: 'INR', receipt: 'test_check' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.description ?? 'Razorpay credentials invalid');
      return NextResponse.json({ success: true, message: 'Razorpay credentials valid ✅' });
    }

    if (provider === 'cashfree') {
      const appId  = config.key_id     ?? process.env.CASHFREE_APP_ID;
      const secret = config.key_secret ?? process.env.CASHFREE_SECRET_KEY;
      const mode   = config.mode       ?? 'production';
      const base   = mode === 'sandbox' ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com';
      const res = await fetch(`${base}/pg/orders`, {
        method: 'POST',
        headers: { 'x-client-id': appId, 'x-client-secret': secret, 'x-api-version': '2023-08-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: 'test_check_' + Date.now(), order_amount: 1, order_currency: 'INR', customer_details: { customer_id: 'test', customer_phone: '9999999999' } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Cashfree credentials invalid');
      return NextResponse.json({ success: true, message: 'Cashfree credentials valid ✅' });
    }

    if (provider === 'easebuzz') {
      const key  = config.key_id     ?? process.env.EASEBUZZ_KEY;
      const salt = config.key_secret ?? process.env.EASEBUZZ_SALT;
      const mode = config.mode       ?? 'production';
      // Easebuzz: test credentials by calling the initiate payment API with a minimal payload
      // We verify the hash response — if key/salt are wrong it returns error
      const crypto = await import('crypto');
      const txnid  = 'test_' + Date.now();
      const hashStr = `${key}|${txnid}|1.00|Test|Test|test@test.com|||||||||||${salt}`;
      const hash   = crypto.createHash('sha512').update(hashStr).digest('hex');
      const base   = mode === 'test' ? 'https://testpay.easebuzz.in' : 'https://pay.easebuzz.in';
      const body   = new URLSearchParams({ key, txnid, amount: '1.00', productinfo: 'Test', firstname: 'Test', email: 'test@test.com', phone: '9999999999', surl: 'https://test.com', furl: 'https://test.com', hash });
      const res = await fetch(`${base}/payment/initiateLink`, { method: 'POST', body });
      const data = await res.json();
      if (data.status === 1) return NextResponse.json({ success: true, message: 'Easebuzz credentials valid ✅' });
      throw new Error(data.error_desc ?? data.data ?? 'Easebuzz credentials invalid');
    }

    if (provider === 'paypal') {
      const clientId     = config.key_id     ?? process.env.PAYPAL_CLIENT_ID;
      const clientSecret = config.key_secret ?? process.env.PAYPAL_CLIENT_SECRET;
      const mode         = config.mode       ?? 'live';
      const base         = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      const creds        = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const res = await fetch(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) throw new Error(data.error_description ?? 'PayPal credentials invalid');
      return NextResponse.json({ success: true, message: `PayPal credentials valid ✅ (${mode} mode)` });
    }

    return NextResponse.json({ error: 'Test not supported for this provider' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
