import crypto from 'crypto';

export interface EasebuzzInitOptions {
  txnid:       string;
  amount:      string;   // major units e.g. "1200.00"
  productinfo: string;
  firstname:   string;
  email:       string;
  phone:       string;   // exactly 10 digits, no country code
  udf1?:       string;
  udf2?:       string;
  udf3?:       string;
  udf4?:       string;
  udf5?:       string;
  surl:        string;   // Easebuzz POSTs form data here on success/failure
  furl:        string;   // Easebuzz POSTs form data here on failure
}

export interface EasebuzzInitResponse {
  access_key:  string;
  payment_url: string;
}

export function generateEasebuzzTxnId(paymentId: string): string {
  // Strip ALL non-alphanumeric chars (dashes from UUID), max 25 chars
  // This matches the working Thynk Schooling pattern exactly
  return paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
}

export function normalisePhone(raw: string): string {
  // Easebuzz requires exactly 10 digits, no country code
  const digits = raw.replace(/\D/g, '').replace(/^91/, '').slice(-10);
  return digits.length === 10 ? digits : '9999999999';
}

export async function initEasebuzzPayment(
  options: EasebuzzInitOptions,
  ebKey:  string,
  ebSalt: string,
  env:    'production' | 'test' = 'production'
): Promise<EasebuzzInitResponse> {
  const merchantKey = ebKey.trim();
  const salt        = ebSalt.trim();

  if (!merchantKey) throw new Error('Easebuzz Merchant Key is empty — check Admin → Integrations → Easebuzz');
  if (!salt)        throw new Error('Easebuzz Salt is empty — check Admin → Integrations → Easebuzz');

  const baseUrl = env === 'production'
    ? 'https://pay.easebuzz.in'
    : 'https://testpay.easebuzz.in';

  // Hash formula (official Easebuzz docs):
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
  // = 6 named fields + udf1-5 + 5 empty trailing fields + salt = 16 pipes total
  // CRITICAL: udf1-5 must be empty strings — passing actual values causes hash mismatch
  // on Easebuzz's side if their stored values differ. Use empty strings for safety.
  const hashStr = [
    merchantKey,
    options.txnid,
    options.amount,
    options.productinfo,
    options.firstname,
    options.email,
    '',  // udf1 — always empty for hash stability
    '',  // udf2
    '',  // udf3
    '',  // udf4
    '',  // udf5
    '',  // trailing empty
    '',
    '',
    '',
    '',
    salt,
  ].join('|');

  const hash = crypto.createHash('sha512').update(hashStr).digest('hex');

  console.log('[Easebuzz] initiating payment:', {
    merchantKey: merchantKey.slice(0, 4) + '***',
    txnid:       options.txnid,
    amount:      options.amount,
    productinfo: options.productinfo,
    env,
  });

  const params = new URLSearchParams({
    key:         merchantKey,
    txnid:       options.txnid,
    amount:      options.amount,
    productinfo: options.productinfo,
    firstname:   options.firstname,
    email:       options.email,
    phone:       options.phone,
    // udf1-5 sent as empty strings — must match hash computation above
    udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
    hash,
    surl: options.surl,
    furl: options.furl,
  });

  const res = await fetch(`${baseUrl}/payment/initiateLink`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const txt = await res.text();
    throw new Error(`Easebuzz error (HTTP ${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  console.log('[Easebuzz initiateLink response]', JSON.stringify(data));

  if (data.status !== 1 || !data.data) {
    throw new Error(`Easebuzz error: ${data.error_desc || JSON.stringify(data)}`);
  }

  return {
    access_key:  data.data,
    payment_url: `${baseUrl}/pay/init`,
  };
}

export function verifyEasebuzzWebhookHash(
  payload: Record<string, string>,
  salt:    string
): boolean {
  // Easebuzz REVERSE hash for response verification (official docs):
  // sha512(salt|status|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const hashStr = [
    salt,
    payload.status      ?? '',
    '',                         // udf5 — always empty (matches what we sent)
    '',                         // udf4
    '',                         // udf3
    '',                         // udf2
    '',                         // udf1
    payload.email       ?? '',
    payload.firstname   ?? '',
    payload.productinfo ?? '',
    payload.amount      ?? '',
    payload.txnid       ?? '',
    payload.key         ?? '',
  ].join('|');

  const expected = crypto.createHash('sha512').update(hashStr).digest('hex');
  const match    = expected === payload.hash;

  if (!match) {
    console.error('[Easebuzz] Hash mismatch — expected:', expected.slice(0, 20) + '...', 'got:', (payload.hash || '').slice(0, 20) + '...');
  }
  return match;
}
