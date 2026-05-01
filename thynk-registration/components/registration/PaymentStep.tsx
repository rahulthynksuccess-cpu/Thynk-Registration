'use client';
// components/registration/PaymentStep.tsx
// Shared payment step used by both OpenRegistrationPage and LockedSchoolPage
// Handles: discount code, amount display, gateway selection, Razorpay/Cashfree/Easebuzz/PayPal

import { useState, useRef, useEffect } from 'react';
import type { Pricing } from '@/lib/types';
import { formatAmount } from '@/lib/utils';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';
// PayPal client ID is passed as a prop (sourced from school API response)

type AllGatewayKey = 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal';

const GW_META: Record<AllGatewayKey, { name: string; selClass: string; sub: string }> = {
  razorpay: { name: 'Razorpay',  selClass: 'sel-rzp', sub: 'Cards, UPI, Net Banking' },
  cashfree: { name: 'Cashfree',  selClass: 'sel-cf',  sub: 'Cards, UPI, Net Banking' },
  easebuzz: { name: 'Easebuzz',  selClass: 'sel-eb',  sub: 'Cards, UPI, Net Banking' },
  paypal:   { name: 'PayPal',    selClass: 'sel-pp',  sub: 'International Cards & Wallets' },
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('Failed to load: ' + src)); };
    document.head.appendChild(s);
  });
}

interface FormData {
  studentName: string;
  classGrade: string;
  gender: string;
  parentSchool: string;
  city: string;
  parentName: string;
  contactPhone: string;
  contactEmail: string;
}

interface Props {
  school: { id: string; name: string; org_name?: string; branding?: any; city?: string; state?: string; country?: string; public_gateway_config?: any };
  pricing: Pricing;
  formData: FormData;
  isIndia: boolean;
  paymentError?: boolean;
  ppClientId?: string | null;
  onBack: () => void;
  onSuccess: () => void;
}

export default function PaymentStep({ school, pricing, formData, isIndia, paymentError, ppClientId, onBack, onSuccess }: Props) {
  const [selGW, setSelGW]       = useState<AllGatewayKey | ''>('');
  const [discCode, setDiscCode] = useState('');
  const [discAmt, setDiscAmt]   = useState(0);
  const [discApplied, setDiscApplied] = useState(false);
  const [discMsg, setDiscMsg]   = useState<{ text: string; type: 'ok' | 'err' | '' }>({ text: '', type: '' });
  const [loader, setLoader]     = useState({ show: false, text: '' });
  const [toast, setToast]       = useState({ text: '', type: '' });
  const [paymentId, setPaymentId] = useState('');
  const toastTimer  = useRef<NodeJS.Timeout>();
  const paypalDone  = useRef(false);

  const baseAmount  = pricing.base_amount;
  const finalAmount = baseAmount - discAmt;
  const symbol      = isIndia ? '₹' : '$';

  // ✅ FIX: prefer admin-configured order from public_gateway_config (set in Admin → Integrations),
  // fall back to pricing.gateway_sequence, then hardcoded default.
  const gwSequence: AllGatewayKey[] = isIndia
    ? ((school.public_gateway_config?.gateway_sequence as AllGatewayKey[] | null)
        ?? (pricing.gateway_sequence as AllGatewayKey[])
        ?? ['cashfree', 'razorpay', 'easebuzz'])
    : ['paypal'];

  useEffect(() => {
    if (paymentError) showToast('Previous payment was cancelled or failed. Please try again.', 'err');
  }, [paymentError]);

  function showToast(text: string, type: 'ok' | 'err' | '') {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ text: '', type: '' }), 4500);
  }
  function showLoader(text: string) { setLoader({ show: true, text }); }
  function hideLoader()             { setLoader({ show: false, text: '' }); }

  // ── Discount ─────────────────────────────────────────────────
  async function applyDiscount() {
    if (!discCode.trim()) { setDiscMsg({ text: 'Please enter a code.', type: 'err' }); return; }
    showLoader('Validating…');
    try {
      const res  = await fetch(`${BACKEND}/api/discount?code=${encodeURIComponent(discCode)}&schoolId=${school.id}`);
      const data = await res.json();
      hideLoader();
      if (data.valid) {
        setDiscAmt(data.discount_amount);
        setDiscApplied(true);
        setDiscMsg({ text: `✅ Discount of ${symbol}${formatAmount(data.discount_amount)} applied!`, type: 'ok' });
        showToast('Discount applied!', 'ok');
      } else {
        setDiscAmt(0); setDiscApplied(false);
        setDiscMsg({ text: `❌ ${data.message || 'Invalid code'}`, type: 'err' });
      }
    } catch {
      hideLoader();
      setDiscMsg({ text: '❌ Could not validate. Try again.', type: 'err' });
    }
  }

  // ── Payment router ────────────────────────────────────────────
  async function startPayment() {
    if (!selGW) { showToast('Please select a payment method.', 'err'); return; }
    if (selGW === 'paypal') { renderPayPal(); return; }

    showLoader('Preparing payment…');
    try {
      const res = await fetch(`${BACKEND}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId:     school.id,
          pricingId:    pricing.id,
          gateway:      selGW,
          ...formData,
          discountCode: discApplied ? discCode : undefined,
        }),
      });
      const data = await res.json();
      hideLoader();
      if (!res.ok) { showToast(data.error ?? 'Payment init failed', 'err'); return; }
      setPaymentId(data.payment_id ?? '');

      if (selGW === 'razorpay') await launchRazorpay(data);
      if (selGW === 'cashfree') await launchCashfree(data);
      if (selGW === 'easebuzz') launchEasebuzz(data);
    } catch (e: any) {
      hideLoader();
      showToast(e.message ?? 'Error starting payment', 'err');
    }
  }

  async function launchRazorpay(data: any) {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    new (window as any).Razorpay({
      key:         data.key_id,
      amount:      data.amount,
      currency:    data.currency,
      order_id:    data.order_id,
      name:        school.org_name || school.name,
      description: pricing.program_name,
      prefill:     { name: formData.studentName, email: formData.contactEmail, contact: formData.contactPhone },
      theme:       { color: school.branding?.primaryColor ?? '#4f46e5' },
      handler: async (resp: any) => {
        showLoader('Confirming payment…');
        await fetch(`${BACKEND}/api/payment/verify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId:         data.payment_id,
            gateway:           'razorpay',
            gatewayTxnId:      resp.razorpay_payment_id,
            razorpayOrderId:   resp.razorpay_order_id,
            razorpaySignature: resp.razorpay_signature,
          }),
        });
        hideLoader();
        onSuccess();
      },
      modal: {
        ondismiss: async () => {
          await fetch(`${BACKEND}/api/payment/verify`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: data.payment_id, gateway: 'razorpay', status: 'cancelled' }),
          });
          showToast('Payment cancelled.', 'err');
        },
      },
    }).open();
  }

  async function launchCashfree(data: any) {
    await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
    (window as any).Cashfree({ mode: data.cf_mode || 'production' })
      .checkout({ paymentSessionId: data.payment_session_id, redirectTarget: '_self' });
  }

  function launchEasebuzz(data: any) {
    const s = document.createElement('script');
    s.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js';
    s.onload = () => {
      const eb = new (window as any).EasebuzzCheckout(data.access_key, (data.env === 'live' || data.env === 'production') ? 'prod' : 'test');
      eb.initiatePayment({
        access_key: data.access_key,
        onResponse: async (r: any) => {
          if (r.status === 'success') {
            showLoader('Confirming payment…');
            await fetch(`${BACKEND}/api/payment/easebuzz-callback?paymentId=${data.payment_id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                status: r.status ?? '', txnid: r.txnid ?? '', mihpayid: r.mihpayid ?? '',
                amount: r.amount ?? '', email: r.email ?? '', firstname: r.firstname ?? '',
                productinfo: r.productinfo ?? '', key: r.key ?? '', hash: r.hash ?? '',
                udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
              }).toString(),
            }).catch(() => {});
            hideLoader();
            onSuccess();
          } else {
            showToast('Payment failed or cancelled. Please try again.', 'err');
          }
        },
      });
    };
    s.onerror = () => showToast('Failed to load payment SDK. Check your connection.', 'err');
    document.head.appendChild(s);
  }

  async function renderPayPal() {
    if (paypalDone.current) return;
    if (!ppClientId) {
      showToast('PayPal is not configured for this school. Contact support.', 'err');
      return;
    }
    showLoader('Loading PayPal…');
    const stale = document.querySelector('script[src*="paypal.com/sdk/js"]');
    if (stale) stale.remove();
    try {
      await loadScript(`https://www.paypal.com/sdk/js?client-id=${ppClientId}&currency=USD&intent=capture&components=buttons`);
    } catch {
      hideLoader();
      showToast('PayPal SDK failed to load. Check your connection or disable ad blockers.', 'err');
      return;
    }
    hideLoader();
    const container = document.getElementById('paypal-btn-container');
    if (!container || !(window as any).paypal) { showToast('PayPal failed to initialize. Please reload.', 'err'); return; }
    container.innerHTML = '';
    paypalDone.current = true;

    (window as any).paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' },
      createOrder: (_: any, actions: any) => actions.order.create({
        purchase_units: [{
          amount: { value: (finalAmount / 100).toFixed(2), currency_code: 'USD' },
          description: pricing.program_name,
        }],
      }),
      onApprove: async (_: any, actions: any) => {
        showLoader('Confirming PayPal payment…');
        const order = await actions.order.capture();
        try {
          await fetch(`${BACKEND}/api/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolId: school.id, pricingId: pricing.id, gateway: 'paypal',
              ...formData, paypalOrderId: order.id, paypalStatus: order.status,
            }),
          });
        } catch {}
        hideLoader();
        onSuccess();
      },
      onCancel: () => { paypalDone.current = false; showToast('PayPal cancelled.', 'err'); },
      onError: (err: any) => { paypalDone.current = false; showToast('PayPal error: ' + (err?.message ?? 'Unknown'), 'err'); },
    }).render('#paypal-btn-container');
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Loader */}
      {loader.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,.88)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div className="loader-spinner" />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--m)' }}>{loader.text}</div>
        </div>
      )}

      {/* Toast */}
      {toast.text && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: toast.type === 'ok' ? 'var(--green)' : toast.type === 'err' ? 'var(--red)' : 'var(--text)', color: '#fff', padding: '12px 24px', borderRadius: 40, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.2)', whiteSpace: 'nowrap' }}>
          {toast.text}
        </div>
      )}

      <div className="atg-card" id="atgCard">
        <div
          className="card-header"
          style={{
            background: school.branding?.primaryColor
              ? `linear-gradient(135deg, ${school.branding.primaryColor}, ${school.branding.accentColor ?? '#8b5cf6'})`
              : undefined,
          }}
        >
          <h1>💳 Payment</h1>
          <p>{pricing.program_name}</p>
        </div>

        <div className="card-body">
          <StepBar step={2} />

          {/* Review */}
          <div className="review-box" style={{ marginBottom: 20 }}>
            {[
              ['Student',  `${formData.studentName} · ${formData.classGrade}`],
              ['School',   formData.parentSchool],
              ['Location', formData.city],
              ['Parent',   formData.parentName],
              ['Phone',    formData.contactPhone],
              ['Email',    formData.contactEmail],
            ].map(([lbl, val]) => (
              <div key={lbl} className="orow">
                <span className="olbl">{lbl}</span>
                <span className="oval">{val}</span>
              </div>
            ))}
          </div>

          {/* Discount — India only */}
          {isIndia && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Have a discount code?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Enter discount code"
                  value={discCode}
                  onChange={e => setDiscCode(e.target.value.toUpperCase())}
                  className={discApplied ? 'disc-ok' : ''}
                  style={{ flex: 1, border: '1.5px solid var(--bd)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.05em', background: discApplied ? '#f0fdf4' : 'var(--card)', borderColor: discApplied ? 'var(--green)' : 'var(--bd)' }}
                />
                <button className="disc-apply" onClick={applyDiscount}>Apply</button>
              </div>
              {discMsg.text && <div className={`disc-msg ${discMsg.type}`} style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: discMsg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>{discMsg.text}</div>}
            </div>
          )}

          {/* Amount */}
          <div className="amount-box" style={{ marginBottom: 20 }}>
            <div className="amount-row">
              <span>Program fee</span>
              <span>{symbol}{formatAmount(baseAmount)}</span>
            </div>
            {discApplied && isIndia && (
              <div className="amount-row" style={{ color: 'var(--green)', fontWeight: 600 }}>
                <span>Discount ({discCode})</span>
                <span>− {symbol}{formatAmount(discAmt)}</span>
              </div>
            )}
            <div style={{ height: 1, background: 'rgba(79,70,229,.12)', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--acc)' }}>
              <span style={{ color: 'var(--text)' }}>Total</span>
              <span>{symbol}{formatAmount(finalAmount)}</span>
            </div>
            {!isIndia && <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 6 }}>International payment · Charged in USD</div>}
          </div>

          {/* Gateway selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Select Payment Method</div>
            <div className="gw-options" id="gwContainer">
              {gwSequence.map(gw => (
                <button
                  key={gw}
                  className={`gw-btn${selGW === gw ? ' sel ' + GW_META[gw].selClass : ''}`}
                  onClick={() => { setSelGW(gw); paypalDone.current = false; }}
                >
                  <div className="gw-name">{GW_META[gw].name}</div>
                  <div className="gw-sub">{GW_META[gw].sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* PayPal container */}
          {selGW === 'paypal' && <div id="paypal-btn-container" style={{ marginBottom: 16 }} />}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-back" onClick={onBack}>← Back</button>
            {selGW !== 'paypal' ? (
              <button
                className="btn-next"
                disabled={!selGW}
                onClick={startPayment}
              >
                {selGW
                  ? `Pay ${symbol}${formatAmount(finalAmount)} via ${GW_META[selGW as AllGatewayKey]?.name} →`
                  : 'Select a payment method'}
              </button>
            ) : (
              <button className="btn-next" style={{ background: 'linear-gradient(135deg,#003087,#0070e0)' }} onClick={renderPayPal}>
                Continue with PayPal →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="steps" style={{ marginBottom: 28 }}>
      {[1, 2, 3].map((n, i) => (
        <div key={n} style={{ display: 'contents' }}>
          <div className={`step-dot${step === n ? ' active' : step > n ? ' done' : ''}`}>
            {step > n ? '✓' : n}
          </div>
          {i < 2 && <div className={`step-line${step > n ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}
