import crypto from 'crypto';

// Server-side only — never import in client components

export interface RazorpayOrderOptions {
  amount: number;      // in paise
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createRazorpayOrder(
  options: RazorpayOrderOptions,
  keyId: string,
  keySecret: string
): Promise<RazorpayOrder> {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: options.amount,
      currency: options.currency ?? 'INR',
      receipt: options.receipt,
      notes: options.notes ?? {},
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Razorpay order creation failed: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');
  return expected === signature;
}

export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}
