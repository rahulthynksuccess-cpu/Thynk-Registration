import crypto from 'crypto';

// Server-side only

export interface EasebuzzInitOptions {
  txnid: string;
  amount: string;         // e.g. "1200.00"
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  udf1?: string;          // parentName
  udf2?: string;          // schoolName
  udf3?: string;          // city
  udf4?: string;          // classGrade
  udf5?: string;          // gender
  surl: string;           // success return URL
  furl: string;           // failure return URL
}

export interface EasebuzzInitResponse {
  access_key: string;
  payment_url: string;
}

function generateEasebuzzHash(options: EasebuzzInitOptions, key: string, salt: string): string {
  // Easebuzz hash formula (same as PayU):
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
  const hashStr = [
    key,
    options.txnid,
    options.amount,
    options.productinfo,
    options.firstname,
    options.email,
    options.udf1 ?? '',
    options.udf2 ?? '',
    options.udf3 ?? '',
    options.udf4 ?? '',
    options.udf5 ?? '',
    '', '', '', '', '',
    salt,
  ].join('|');

  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

export async function initEasebuzzPayment(
  options: EasebuzzInitOptions,
  ebKey: string,
  ebSalt: string,
  env: 'production' | 'test' = 'production'
): Promise<EasebuzzInitResponse> {
  // Trim to remove any accidental spaces/newlines from copy-paste in Admin → Integrations
  const merchantKey = ebKey.trim();
  const salt        = ebSalt.trim();

  if (!merchantKey) throw new Error('Easebuzz Merchant Key is empty — check Admin → Integrations → Easebuzz');
  if (!salt)        throw new Error('Easebuzz Salt is empty — check Admin → Integrations → Easebuzz');

  const baseUrl =
    env === 'production'
      ? 'https://pay.easebuzz.in'
      : 'https://testpay.easebuzz.in';

  const hash = generateEasebuzzHash(options, merchantKey, salt);

  console.log('[Easebuzz] initiating payment:', {
    merchantKey: merchantKey.slice(0, 4) + '***',
    txnid: options.txnid,
    amount: options.amount,
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
    udf1:        options.udf1 ?? '',
    udf2:        options.udf2 ?? '',
    udf3:        options.udf3 ?? '',
    udf4:        options.udf4 ?? '',
    udf5:        options.udf5 ?? '',
    hash,
    surl:        options.surl,
    furl:        options.furl,
  });

  const res = await fetch(`${baseUrl}/payment/initiateLink/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
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
  salt: string
): boolean {
  // Easebuzz response hash: sha512(salt|status||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const hashStr = [
    salt,
    payload.status ?? '',
    '',
    payload.udf5 ?? '',
    payload.udf4 ?? '',
    payload.udf3 ?? '',
    payload.udf2 ?? '',
    payload.udf1 ?? '',
    payload.email ?? '',
    payload.firstname ?? '',
    payload.productinfo ?? '',
    payload.amount ?? '',
    payload.txnid ?? '',
    payload.key ?? '',
  ].join('|');

  const expected = crypto.createHash('sha512').update(hashStr).digest('hex');
  return expected === payload.hash;
}
