'use client';
import { useState, useEffect, useRef } from 'react';
import type { SchoolWithPricing, Pricing, GatewayKey } from '@/lib/types';
import { formatAmount } from '@/lib/utils';

interface Props {
  school: SchoolWithPricing & { public_gateway_config: any; allowed_grades?: string[] };
  pricing: Pricing;
  projectSlug?: string;
  paymentError?: boolean;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';

// ── Gateway config ─────────────────────────────────────────────────
type AllGatewayKey = GatewayKey | 'paypal';

const GATEWAY_LABELS: Record<AllGatewayKey, { name: string; color: string; selClass: string; sub: string }> = {
  razorpay: { name: 'Razorpay',  color: '#2563eb', selClass: 'sel-rzp', sub: 'Cards, UPI, Net Banking' },
  cashfree: { name: 'Cashfree',  color: '#2563eb', selClass: 'sel-cf',  sub: 'Cards, UPI, Net Banking' },
  easebuzz: { name: 'Easebuzz',  color: '#f97316', selClass: 'sel-eb',  sub: 'Cards, UPI, Net Banking' },
  paypal:   { name: 'PayPal',    color: '#003087', selClass: 'sel-pp',  sub: 'International Cards & Wallets' },
};

// PayPal client ID — set this in your env or pass via school config
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? 'YOUR_PAYPAL_CLIENT_ID';

type Step = 1 | 2 | 3;

function loadScript(src: string): Promise<void> {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

// Detect if user is from India via timezone
function detectIsIndia(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata';
  } catch {
    return true; // default to India
  }
}

export default function RegistrationCard({ school, pricing, paymentError }: Props) {
  const [step, setStep]       = useState<Step>(1);
  const [isIndia, setIsIndia] = useState(true);
  const [selGW, setSelGW]     = useState<AllGatewayKey | ''>('');
  const [discCode, setDiscCode]   = useState('');
  const [discAmt, setDiscAmt]     = useState(0);
  const [discMsg, setDiscMsg]     = useState<{ text: string; type: 'ok' | 'err' | '' }>({ text: '', type: '' });
  const [discApplied, setDiscApplied] = useState(false);
  const [loader, setLoader]   = useState({ show: false, text: '' });
  const [toast, setToast]     = useState({ text: '', type: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [fd, setFd]           = useState<Record<string, string>>({});
  const [paymentId, setPaymentId] = useState('');
  const toastTimer = useRef<NodeJS.Timeout>();
  const paypalRendered = useRef(false);

  const baseAmount  = pricing.base_amount;       // paise (INR) or cents (USD)
  const finalAmount = baseAmount - discAmt;
  const currency    = isIndia ? 'INR' : 'USD';
  const symbol      = isIndia ? '₹' : '$';

  // Grades: use project's allowed_grades; fallback to default list
  const DEFAULT_GRADES = [
    'Nursery',
    'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
    'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12',
  ];
  const gradeOptions: string[] =
    school.allowed_grades && school.allowed_grades.length > 0
      ? school.allowed_grades
      : DEFAULT_GRADES;

  // Detect geography on mount
  useEffect(() => {
    setIsIndia(detectIsIndia());
  }, []);

  useEffect(() => {
    if (paymentError) showToast('Previous payment was cancelled or failed. Please try again.', 'err');
  }, [paymentError]);

  // Gateway sequence: India = from pricing config, International = PayPal only
  const gwSequence: AllGatewayKey[] = isIndia
    ? (pricing.gateway_sequence as GatewayKey[])
    : ['paypal'];

  function showToast(text: string, type: 'ok' | 'err' | '') {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ text: '', type: '' }), 4500);
  }
  function showLoader(text: string) { setLoader({ show: true, text }); }
  function hideLoader()             { setLoader({ show: false, text: '' }); }

  // ── Validation ─────────────────────────────────────────────────
  const rules: Record<string, (v: string) => string | null> = {
    studentName:  v => v.trim().length >= 2 ? null : 'Enter student name (min 2 chars)',
    classGrade:   v => v !== '' ? null : 'Select class / grade',
    gender:       v => v !== '' ? null : 'Select gender',
    parentSchool: v => v.trim().length >= 2 ? null : 'Enter current school name',
    city:         v => v.trim().length >= 2 ? null : 'Enter city name',
    parentName:   v => v.trim().length >= 2 ? null : "Enter parent's name",
    contactPhone: v => v.trim().length > 0 ? null : 'Please enter a mobile number',
    contactEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address',
  };

  function validate(data: Record<string, string>): boolean {
    const errors: Record<string, string> = {};
    for (const [field, check] of Object.entries(rules)) {
      const err = check(data[field] ?? '');
      if (err) errors[field] = err;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goToPayment(formData: Record<string, string>) {
    if (!validate(formData)) { showToast('Please fill all fields correctly.', 'err'); return; }
    setFd(formData);
    setStep(2);
  }

  // ── Discount ───────────────────────────────────────────────────
  async function applyDiscount(code: string) {
    if (!code.trim()) { setDiscMsg({ text: 'Please enter a code.', type: 'err' }); return; }
    showLoader('Validating discount code…');
    try {
      const res  = await fetch(`${BACKEND}/api/discount?code=${encodeURIComponent(code)}&schoolId=${school.id}`);
      const data = await res.json();
      hideLoader();
      if (data.valid) {
        setDiscAmt(data.discount_amount);
        setDiscApplied(true);
        setDiscMsg({ text: `✅ Discount of ${symbol}${formatAmount(data.discount_amount)} applied!`, type: 'ok' });
        showToast(`Discount applied! Saving ${symbol}${formatAmount(data.discount_amount)}`, 'ok');
      } else {
        setDiscAmt(0); setDiscApplied(false);
        setDiscMsg({ text: `❌ ${data.message}`, type: 'err' });
      }
    } catch {
      hideLoader();
      setDiscMsg({ text: '❌ Could not validate. Try again.', type: 'err' });
    }
  }

  // ── Payment router ─────────────────────────────────────────────
  async function startPayment() {
    if (!selGW) { showToast('Please select a payment method.', 'err'); return; }
    if (selGW === 'paypal') { renderPayPalButton(); return; }

    showLoader('Preparing payment…');
    try {
      const res = await fetch(`${BACKEND}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId:     school.id,
          pricingId:    pricing.id,
          gateway:      selGW,
          studentName:  fd.studentName,
          classGrade:   fd.classGrade,
          gender:       fd.gender,
          parentSchool: fd.parentSchool,
          city:         fd.city,
          parentName:   fd.parentName,
          contactPhone: fd.contactPhone,
          contactEmail: fd.contactEmail,
          discountCode: discApplied ? discCode : undefined,
        }),
      });
      const data = await res.json();
      hideLoader();
      if (!res.ok) { showToast(data.error ?? 'Payment init failed', 'err'); return; }
      setPaymentId(data.payment_id);

      if (selGW === 'razorpay') await launchRazorpay(data);
      if (selGW === 'cashfree') await launchCashfree(data);
      if (selGW === 'easebuzz') launchEasebuzz(data);
    } catch (e: any) {
      hideLoader();
      showToast(e.message ?? 'Error starting payment', 'err');
    }
  }

  // ── Razorpay ───────────────────────────────────────────────────
  async function launchRazorpay(data: any) {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const rzp = new (window as any).Razorpay({
      key:         data.key_id,
      amount:      data.amount,
      currency:    data.currency,
      order_id:    data.order_id,
      name:        school.org_name,
      description: pricing.program_name,
      prefill: {
        name:    fd.studentName,
        email:   fd.contactEmail,
        contact: isIndia ? fd.contactPhone : '',
      },
      notes: { student: fd.studentName, school: fd.parentSchool, city: fd.city, class_grade: fd.classGrade },
      theme: { color: school.branding?.primaryColor ?? '#2563eb' },
      handler: async (response: any) => {
        showLoader('Confirming payment…');
        await fetch(`${BACKEND}/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId:         data.payment_id,
            gateway:           'razorpay',
            gatewayTxnId:      response.razorpay_payment_id,
            razorpayOrderId:   response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          }),
        });
        hideLoader();
        showSuccess();
      },
      modal: {
        ondismiss: async () => {
          await fetch(`${BACKEND}/api/payment/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: data.payment_id, gateway: 'razorpay', status: 'cancelled' }),
          });
          showToast('Payment cancelled.', 'err');
        },
      },
    });
    rzp.open();
  }

  // ── Cashfree ───────────────────────────────────────────────────
  async function launchCashfree(data: any) {
    await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
    const cashfree = (window as any).Cashfree({ mode: data.cf_mode });
    cashfree.checkout({
      paymentSessionId: data.payment_session_id,
      redirectTarget: '_self',
    }).catch((e: any) => showToast('Cashfree error: ' + e.message, 'err'));
  }

  // ── Easebuzz ───────────────────────────────────────────────────
  function launchEasebuzz(data: any) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.payment_url;
    form.target = '_self';
    const inp = document.createElement('input');
    inp.type = 'hidden'; inp.name = 'access_key'; inp.value = data.access_key;
    form.appendChild(inp);
    document.body.appendChild(form);
    form.submit();
  }

  // ── PayPal (international only) ────────────────────────────────
  async function renderPayPalButton() {
    if (paypalRendered.current) return;
    showLoader('Loading PayPal…');
    await loadScript(`https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`);
    hideLoader();

    const container = document.getElementById('paypal-button-container');
    if (!container || !(window as any).paypal) {
      showToast('PayPal failed to load. Please try again.', 'err');
      return;
    }
    container.innerHTML = '';
    paypalRendered.current = true;

    (window as any).paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' },
      createOrder: (_: any, actions: any) => {
        return actions.order.create({
          purchase_units: [{
            amount: {
              value: (finalAmount / 100).toFixed(2),
              currency_code: 'USD',
            },
            description: pricing.program_name,
          }],
        });
      },
      onApprove: async (_: any, actions: any) => {
        showLoader('Confirming PayPal payment…');
        const order = await actions.order.capture();
        try {
          await fetch(`${BACKEND}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolId:     school.id,
              pricingId:    pricing.id,
              gateway:      'paypal',
              studentName:  fd.studentName,
              classGrade:   fd.classGrade,
              gender:       fd.gender,
              parentSchool: fd.parentSchool,
              city:         fd.city,
              parentName:   fd.parentName,
              contactPhone: fd.contactPhone,
              contactEmail: fd.contactEmail,
              paypalOrderId: order.id,
              paypalStatus:  order.status,
            }),
          });
        } catch {}
        hideLoader();
        showSuccess();
        showToast('PayPal payment confirmed! ✅', 'ok');
      },
      onCancel: () => {
        paypalRendered.current = false;
        showToast('PayPal payment cancelled.', 'err');
      },
      onError: (err: any) => {
        paypalRendered.current = false;
        showToast('PayPal error: ' + (err?.message ?? 'Unknown error'), 'err');
      },
    }).render('#paypal-button-container');
  }

  function showSuccess() {
    setStep(3);
    showToast('Registration confirmed! ✅', 'ok');
    let count = 5;
    const t = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(t);
        window.location.href = school.branding?.redirectURL ?? 'https://www.thynksuccess.com';
      }
    }, 1000);
  }

  return (
    <>
      {/* Loader */}
      <div className={`loader${loader.show ? ' show' : ''}`}>
        <div className="loader-spinner" />
        <div className="loader-text">{loader.text || 'Please wait…'}</div>
      </div>

      {/* Toast */}
      <div className={`toast${toast.text ? ' show' : ''}${toast.type === 'ok' ? ' tok' : toast.type === 'err' ? ' terr' : ''}`}>
        {toast.text}
      </div>

      <div className="atg-card" id="atgCard">
        {/* Header */}
        <div className="card-header" style={{ background: `linear-gradient(135deg, ${school.branding?.primaryColor ?? '#4f46e5'} 0%, ${school.branding?.accentColor ?? '#8b5cf6'} 100%)` }}>
          {school.logo_url && <img src={school.logo_url} alt={school.name} style={{ height: 40, marginBottom: 8 }} />}
          <h1>{school.name}</h1>
          <p>{school.org_name}</p>
        </div>

        <div className="card-body">
          {/* Step indicator */}
          <div className="steps">
            {[1, 2, 3].map((n, i) => (
              <div key={n} style={{ display: 'contents' }}>
                <div className={`step-dot${step === n ? ' active' : step > n ? ' done' : ''}`}>
                  {step > n ? '✓' : n}
                </div>
                {i < 2 && <div className={`step-line${step > n ? ' done' : ''}`} />}
              </div>
            ))}
          </div>

          {/* ── Step 1: Form ─────────────────────────────── */}
          {step === 1 && (
            <FormStep
              onSubmit={goToPayment}
              errors={formErrors}
              programName={pricing.program_name}
              gradeOptions={gradeOptions}
            />
          )}

          {/* ── Step 2: Payment ──────────────────────────── */}
          {step === 2 && (
            <div>
              {/* Review */}
              <div className="review-box">
                {[
                  ['Student', `${fd.studentName} · ${fd.classGrade}`],
                  ['School',  `${fd.parentSchool}, ${fd.city}`],
                  ['Parent',  fd.parentName],
                  ['Phone',   fd.contactPhone],
                  ['Email',   fd.contactEmail],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="orow">
                    <span className="olbl">{lbl}</span>
                    <span className="oval">{val}</span>
                  </div>
                ))}
              </div>

              {/* Discount (India only) */}
              {isIndia && (
                <>
                  <div className="disc-row">
                    <input
                      type="text"
                      placeholder="Discount code"
                      value={discCode}
                      onChange={e => setDiscCode(e.target.value.toUpperCase())}
                      className={discApplied ? 'disc-ok' : ''}
                      style={{ flex: 1, border: '1.5px solid var(--bd)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'DM Sans', outline: 'none', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.05em' }}
                    />
                    <button className="disc-apply" onClick={() => applyDiscount(discCode)}>Apply</button>
                  </div>
                  {discMsg.text && <div className={`disc-msg ${discMsg.type}`}>{discMsg.text}</div>}
                </>
              )}

              {/* Amount */}
              <div className="amount-box">
                <div className="amount-row">
                  <span>Program fee</span>
                  <span>{symbol}{formatAmount(baseAmount)}</span>
                </div>
                {discApplied && isIndia && (
                  <div className="amount-row disc show">
                    <span>Discount ({discCode})</span>
                    <span>− {symbol}{formatAmount(discAmt)}</span>
                  </div>
                )}
                <div className="amount-row" style={{ fontFamily: 'Sora', fontWeight: 800, fontSize: 18, paddingTop: 8, borderTop: '1px solid var(--bd)', marginTop: 4 }}>
                  <span>Total</span>
                  <span>{symbol}{formatAmount(finalAmount)}</span>
                </div>
                {!isIndia && (
                  <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 6 }}>
                    International payment · Charged in USD
                  </div>
                )}
              </div>

              {/* Gateway selector */}
              <div className="gw-section">
                <div className="gw-label">Select payment method</div>
                <div className="gw-options" id="gwContainer">
                  {gwSequence.map(gw => (
                    <button
                      key={gw}
                      id={`gw${gw}`}
                      className={`gw-btn${selGW === gw ? ' ' + GATEWAY_LABELS[gw].selClass : ''}`}
                      onClick={() => { setSelGW(gw); paypalRendered.current = false; }}
                    >
                      {GATEWAY_LABELS[gw].name}
                      {!isIndia && <div style={{ fontSize: 11, color: 'inherit', opacity: 0.7 }}>{GATEWAY_LABELS[gw].sub}</div>}
                    </button>
                  ))}
                </div>
              </div>

              {selGW === 'paypal' && (
                <div id="paypal-button-container" style={{ marginBottom: 16 }} />
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-back" onClick={() => setStep(1)}>← Back</button>
                {selGW !== 'paypal' && (
                  <button
                    className="btn-next"
                    disabled={!selGW}
                    style={{
                      background: selGW
                        ? `linear-gradient(135deg, ${GATEWAY_LABELS[selGW as AllGatewayKey]?.color ?? '#4f46e5'}, ${school.branding?.accentColor ?? '#8b5cf6'})`
                        : undefined,
                    }}
                    onClick={startPayment}
                  >
                    {selGW
                      ? `Pay ${symbol}${formatAmount(finalAmount)} via ${GATEWAY_LABELS[selGW as AllGatewayKey]?.name}`
                      : 'Select a payment method'}
                  </button>
                )}
                {selGW === 'paypal' && (
                  <button
                    className="btn-next"
                    style={{ background: 'linear-gradient(135deg, #003087, #0070e0)' }}
                    onClick={renderPayPalButton}
                  >
                    Continue with PayPal →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Success ──────────────────────────── */}
          {step === 3 && (
            <div className="success-screen show">
              <div className="success-icon" style={{ display: 'flex' }}>✅</div>
              <h2>Registration Confirmed!</h2>
              <p>Thank you for registering. You will receive a confirmation email shortly.</p>
              <div className="review-box" style={{ textAlign: 'left', marginBottom: 16 }}>
                {[
                  ['Student',     `${fd.studentName} · ${fd.classGrade}`],
                  ['School',      `${fd.parentSchool}, ${fd.city}`],
                  ['Amount Paid', `${symbol}${formatAmount(finalAmount)}`],
                  ['Gateway',     GATEWAY_LABELS[selGW as AllGatewayKey]?.name ?? selGW],
                  ['Payment ID',  paymentId || '—'],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="sdrow">
                    <span className="sdlbl">{lbl}</span>
                    <span className="sdval" style={{ fontSize: lbl === 'Payment ID' ? 11 : undefined, color: lbl === 'Amount Paid' ? 'var(--green)' : undefined }}>{val}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--m2)' }}>Redirecting you to www.thynksuccess.com…</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Form sub-component ────────────────────────────────────────────
function FormStep({ onSubmit, errors, programName, gradeOptions }: {
  onSubmit: (data: Record<string, string>) => void;
  errors: Record<string, string>;
  programName: string;
  gradeOptions: string[];
}) {
  const [data, setData] = useState<Record<string, string>>({
    studentName: '', classGrade: '', gender: '',
    parentSchool: '', city: '', parentName: '',
    contactPhone: '', contactEmail: '',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData(d => ({ ...d, [field]: e.target.value }));

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--m)', marginBottom: 20 }}>
        Complete the form below to register for <strong>{programName}</strong>.
      </p>

      <div className="field">
        <label>Student Name *</label>
        <input value={data.studentName} onChange={set('studentName')} placeholder="Full name of student" className={errors.studentName ? 'err' : ''} />
        {errors.studentName && <div className="err-msg show">{errors.studentName}</div>}
      </div>

      <div className="field-row">
        <div className="field">
          <label>Class / Grade *</label>
          {/* ── Populated from project's allowed_grades ── */}
          <select value={data.classGrade} onChange={set('classGrade')} className={errors.classGrade ? 'err' : ''}>
            <option value="">Select class</option>
            {gradeOptions.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          {errors.classGrade && <div className="err-msg show">{errors.classGrade}</div>}
        </div>
        <div className="field">
          <label>Gender *</label>
          <select value={data.gender} onChange={set('gender')} className={errors.gender ? 'err' : ''}>
            <option value="">Select</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
          {errors.gender && <div className="err-msg show">{errors.gender}</div>}
        </div>
      </div>

      <div className="field">
        <label>Current School Name *</label>
        <input value={data.parentSchool} onChange={set('parentSchool')} placeholder="School where student studies" className={errors.parentSchool ? 'err' : ''} />
        {errors.parentSchool && <div className="err-msg show">{errors.parentSchool}</div>}
      </div>

      <div className="field">
        <label>City *</label>
        <input value={data.city} onChange={set('city')} placeholder="City" className={errors.city ? 'err' : ''} />
        {errors.city && <div className="err-msg show">{errors.city}</div>}
      </div>

      <div className="field">
        <label>Parent / Guardian Name *</label>
        <input value={data.parentName} onChange={set('parentName')} placeholder="Full name of parent or guardian" className={errors.parentName ? 'err' : ''} />
        {errors.parentName && <div className="err-msg show">{errors.parentName}</div>}
      </div>

      <div className="field-row">
        <div className="field">
          <label>Mobile Number *</label>
          <input
            value={data.contactPhone}
            onChange={set('contactPhone')}
            placeholder="Mobile number"
            type="tel"
            inputMode="tel"
            className={errors.contactPhone ? 'err' : ''}
          />
          {errors.contactPhone && <div className="err-msg show">{errors.contactPhone}</div>}
        </div>
        <div className="field">
          <label>Email *</label>
          <input value={data.contactEmail} onChange={set('contactEmail')} placeholder="Email address" type="email" className={errors.contactEmail ? 'err' : ''} />
          {errors.contactEmail && <div className="err-msg show">{errors.contactEmail}</div>}
        </div>
      </div>

      <button className="btn-next" onClick={() => onSubmit(data)}>
        Continue to Payment →
      </button>
    </div>
  );
}
