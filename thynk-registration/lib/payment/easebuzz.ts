/**
 * lib/payment/easebuzz.ts
 *
 * Easebuzz payment initiation + hash verification.
 * Ported from the WORKING Thynk Schooling implementation.
 *
 * OFFICIAL HASH FORMULAS (from https://github.com/easebuzz/paywitheasebuzz-php-lib):
 *
 *   FORWARD (initiateLink):
 *     sha512( key | txnid | amount | productinfo | firstname | email |
 *             udf1 | udf2 | udf3 | udf4 | udf5 | udf6 | udf7 | udf8 | udf9 | udf10 | salt )
 *     = 16 pipes, 17 segments
 *
 *   REVERSE (callback verification):
 *     sha512( salt | status | udf10 | udf9 | udf8 | udf7 | udf6 |
 *             udf5 | udf4 | udf3 | udf2 | udf1 | email | firstname |
 *             productinfo | amount | txnid | key )
 *     = 17 pipes, 18 segments
 */

import crypto from 'crypto';

export interface EasebuzzInitOptions {
  txnid:       string;
  amount:      string;   // major units e.g. "1200.00"
  productinfo: string;
  firstname:   string;
  email:       string;
  phone:       string;   // exactly 10 digits, no country code
  surl:        string;   // Easebuzz POSTs form data here on success
  furl:        string;   // Easebuzz POSTs form data here on failure
}

export interface EasebuzzInitResponse {
  access_key:  string;
  payment_url: string;
}

export function generateEasebuzzTxnId(paymentId: string): string {
  // Strip ALL non-alphanumeric chars (dashes from UUID), max 25 chars
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

  // OFFICIAL FORWARD HASH (PHP lib reference):
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt)
  // All udf1-10 are empty strings — must match the form POST values exactly.
  // CRITICAL: Always use empty strings for all udf fields. Passing actual values
  // causes hash mismatch on Easebuzz's callback verification.
  const hashStr = [
    merchantKey,
    options.txnid,
    options.amount,
    options.productinfo,
    options.firstname,
    options.email,
    '', // udf1
    '', // udf2
    '', // udf3
    '', // udf4
    '', // udf5
    '', // udf6
    '', // udf7
    '', // udf8
    '', // udf9
    '', // udf10
    salt,
  ].join('|');
  // = 17 items joined = 16 pipes — matches official formula exactly

  const hash = crypto.createHash('sha512').update(hashStr).digest('hex');

  console.log('[Easebuzz] initiating payment:', {
    merchantKey: merchantKey.slice(0, 4) + '***',
    txnid:       options.txnid,
    amount:      options.amount,
    productinfo: options.productinfo,
    env,
  });

  // NOTE: Trailing slash on /payment/initiateLink/ is REQUIRED.
  // Removing it causes WC0E03 on the payment page.
  // The working Thynk Schooling code uses the trailing slash.
  const res = await fetch(`${baseUrl}/payment/initiateLink/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      key:         merchantKey,
      txnid:       options.txnid,
      amount:      options.amount,
      productinfo: options.productinfo,
      firstname:   options.firstname,
      email:       options.email,
      phone:       options.phone,
      // udf1-10 sent as empty strings — must match forward hash exactly
      udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
      udf6: '', udf7: '', udf8: '', udf9: '', udf10: '',
      hash,
      surl: options.surl,
      furl: options.furl,
    }).toString(),
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
  // OFFICIAL REVERSE HASH (PHP lib reference):
  // sha512(salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  // udf6-10 may not be present in the POST body — default to empty string.
  // This matches what we sent in the forward hash (all udfs empty).
  const hashStr = [
    salt,
    payload.status      ?? '',
    payload.udf10       ?? '', // udf10 (empty — we never send it)
    payload.udf9        ?? '', // udf9
    payload.udf8        ?? '', // udf8
    payload.udf7        ?? '', // udf7
    payload.udf6        ?? '', // udf6
    payload.udf5        ?? '', // udf5 (empty — we send it empty)
    payload.udf4        ?? '', // udf4
    payload.udf3        ?? '', // udf3
    payload.udf2        ?? '', // udf2
    payload.udf1        ?? '', // udf1
    payload.email       ?? '',
    payload.firstname   ?? '',
    payload.productinfo ?? '',
    payload.amount      ?? '',
    payload.txnid       ?? '',
    payload.key         ?? '',
  ].join('|');
  // = 18 items joined = 17 pipes — matches official reverse hash formula exactly

  const expected = crypto.createHash('sha512').update(hashStr).digest('hex');
  const match    = expected === payload.hash;

  if (!match) {
    console.error(
      '[Easebuzz] Hash mismatch — expected:', expected.slice(0, 20) + '...',
      'got:', (payload.hash || '').slice(0, 20) + '...'
    );
  }
  return match;
}
