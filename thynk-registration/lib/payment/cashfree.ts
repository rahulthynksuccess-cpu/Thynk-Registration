// Server-side only

export interface CashfreeOrderOptions {
  orderId: string;
  amount: number;        // in rupees (e.g. 1200.00)
  currency?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}

export interface CashfreeOrderResponse {
  payment_session_id: string;
  order_id: string;
  order_status: string;
}

export async function createCashfreeOrder(
  options: CashfreeOrderOptions,
  appId: string,
  secretKey: string,
  mode: 'production' | 'sandbox' = 'production'
): Promise<CashfreeOrderResponse> {
  const baseUrl =
    mode === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': '2023-08-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order_id: options.orderId,
      order_amount: options.amount,
      order_currency: options.currency ?? 'INR',
      customer_details: {
        customer_id: `cust_${options.orderId}`,
        customer_name: options.customerName,
        customer_email: options.customerEmail,
        customer_phone: options.customerPhone,
      },
      order_meta: { return_url: options.returnUrl },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Cashfree order creation failed: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export async function verifyCashfreePayment(
  orderId: string,
  appId: string,
  secretKey: string,
  mode: 'production' | 'sandbox' = 'production'
): Promise<{ status: string; cf_payment_id?: string }> {
  const baseUrl =
    mode === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

  const res = await fetch(`${baseUrl}/orders/${orderId}`, {
    headers: {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': '2023-08-01',
    },
  });

  if (!res.ok) throw new Error('Cashfree order fetch failed');
  const data = await res.json();
  return { status: data.order_status, cf_payment_id: data.cf_order_id };
}
