'use client';
/**
 * ManualPaymentModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a "Record Manual Payment" button + slide-in form panel inside the
 * StudentDetailModal. Matches all the fields that an online payment captures.
 *
 * USAGE — add inside StudentDetailModal in admin/page.tsx,
 *         just before the WhatsApp / Call / Email action buttons:
 *
 *   import { ManualPaymentPanel } from '@/components/admin/ManualPaymentPanel';
 *
 *   // inside StudentDetailModal, below the info rows section:
 *   <ManualPaymentPanel
 *     student={student}
 *     authHeaders={authHeaders}
 *     BACKEND={BACKEND}
 *     onSuccess={(updatedStudent) => {
 *       showToast('✅ Payment recorded!', '✅');
 *       // Optionally refresh the parent row:
 *       // setModal({ ...modal, ...updatedStudent });
 *     }}
 *   />
 *
 * FIELDS captured (mirrors online payment):
 *   gateway         — razorpay | cashfree | easebuzz | cash | bank_transfer | cheque | upi | other
 *   gateway_txn_id  — transaction / UTR / cheque number (free text)
 *   base_amount     — original fee before discount
 *   discount_code   — coupon code if any
 *   discount_amount — discount value
 *   final_amount    — amount actually paid
 *   paid_at         — date+time of payment
 *   notes           — internal admin note
 *
 * EFFECT on success:
 *   • Marks payment row as 'paid' (creates or updates pending row)
 *   • Updates registration.status → 'paid'
 *   • Fires registration.created + payment.paid triggers (same as online)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;

// ── Gateway options ───────────────────────────────────────────────────────────
const GATEWAY_OPTIONS = [
  { value: 'razorpay',      label: '💳 Razorpay',      group: 'Online Gateway' },
  { value: 'cashfree',      label: '💳 Cashfree',       group: 'Online Gateway' },
  { value: 'easebuzz',      label: '💳 Easebuzz',       group: 'Online Gateway' },
  { value: 'upi',           label: '📱 UPI',            group: 'Offline / Manual' },
  { value: 'cash',          label: '💵 Cash',           group: 'Offline / Manual' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer',  group: 'Offline / Manual' },
  { value: 'cheque',        label: '📝 Cheque',         group: 'Offline / Manual' },
  { value: 'other',         label: '🔖 Other',          group: 'Offline / Manual' },
];

const TXN_PLACEHOLDER: Record<string, string> = {
  razorpay:      'pay_XXXXXXXXXXXXXXXXXX',
  cashfree:      'CF order / payment ID',
  easebuzz:      'Easebuzz txn ID',
  upi:           'UPI reference / UTR number',
  bank_transfer: 'UTR / NEFT / RTGS reference',
  cash:          'Receipt number (optional)',
  cheque:        'Cheque number',
  other:         'Reference / receipt number',
};

// ── Style helpers ─────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)',
  boxSizing: 'border-box',
};
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)',
  marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '.05em',
};
const GRID2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
};

function toLocalDatetimeValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  // Format as YYYY-MM-DDTHH:MM for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert rupees display → paise (or dollars → cents)
function toPaise(display: string): number {
  const n = parseFloat(display.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}
// Convert paise → readable display string
function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ManualPaymentPanel({
  student,
  authHeaders,
  BACKEND = '',
  onSuccess,
}: {
  student:      Row;
  authHeaders:  () => HeadersInit;
  BACKEND?:     string;
  onSuccess?:   (updated: Partial<Row>) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Currency symbol
  const currency = student.currency === 'USD' ? '$' : '₹';

  // ── Form state — mirror exactly what a successful online payment saves ──
  const [gateway,        setGateway]       = useState('');
  const [txnId,          setTxnId]         = useState('');
  const [baseAmt,        setBaseAmt]       = useState(
    student.base_amount  ? fromPaise(student.base_amount)  : fromPaise(student.final_amount ?? 0)
  );
  const [discountCode,   setDiscountCode]  = useState(student.discount_code ?? '');
  const [discountAmt,    setDiscountAmt]   = useState(
    student.discount_amount ? fromPaise(student.discount_amount) : '0.00'
  );
  const [finalAmt,       setFinalAmt]      = useState(
    student.final_amount ? fromPaise(student.final_amount) : ''
  );
  const [paidAt,         setPaidAt]        = useState(toLocalDatetimeValue());
  const [notes,          setNotes]         = useState('');

  // Auto-compute final amount when base/discount changes
  const handleBaseChange = useCallback((val: string) => {
    setBaseAmt(val);
    const base = parseFloat(val) || 0;
    const disc = parseFloat(discountAmt) || 0;
    const final = Math.max(0, base - disc);
    setFinalAmt(final.toFixed(2));
  }, [discountAmt]);

  const handleDiscountChange = useCallback((val: string) => {
    setDiscountAmt(val);
    const base = parseFloat(baseAmt) || 0;
    const disc = parseFloat(val) || 0;
    const final = Math.max(0, base - disc);
    setFinalAmt(final.toFixed(2));
  }, [baseAmt]);

  async function handleSubmit() {
    setError('');
    if (!gateway)            { setError('Please select a payment gateway / method.'); return; }
    if (!finalAmt || parseFloat(finalAmt) <= 0) { setError('Final amount must be greater than 0.'); return; }

    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/payment/manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: student.id,
          gateway,
          gateway_txn_id:  txnId.trim() || null,
          base_amount:     toPaise(baseAmt),
          discount_amount: toPaise(discountAmt),
          final_amount:    toPaise(finalAmt),
          discount_code:   discountCode.trim() || null,
          paid_at:         new Date(paidAt).toISOString(),
          notes:           notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to record payment.');
        setSaving(false);
        return;
      }

      // Surface updated fields to parent so the detail row refreshes inline
      onSuccess?.({
        payment_status: 'paid',
        gateway,
        gateway_txn_id: txnId.trim() || null,
        base_amount:    toPaise(baseAmt),
        discount_amount: toPaise(discountAmt),
        final_amount:   toPaise(finalAmt),
        discount_code:  discountCode.trim() || null,
        paid_at:        new Date(paidAt).toISOString(),
      });
      setOpen(false);
    } catch (e: any) {
      setError(`Network error: ${e.message}`);
    }
    setSaving(false);
  }

  // Already paid — show a read-only summary badge instead of the button
  const isPaid = student.payment_status === 'paid';

  // ── Read-only payment details (shown when already paid) ──────────────────
  if (isPaid && !open) {
    return (
      <div style={{
        margin: '0 24px 16px',
        padding: '12px 14px',
        background: 'rgba(34,197,94,0.06)',
        border: '1.5px solid rgba(34,197,94,0.2)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            ✅ Payment Recorded
          </div>
          <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3 }}>
            {student.gateway ?? '—'} · {student.gateway_txn_id ?? 'no txn ID'} · {
              student.paid_at
                ? new Date(student.paid_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
                : '—'
            }
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            border: '1.5px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)',
            color: '#16a34a', borderRadius: 8, padding: '5px 12px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            fontFamily: 'DM Sans,sans-serif',
          }}
        >
          ✏️ Edit
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Trigger button — only shown when not already open */}
      {!open && (
        <div style={{ padding: '0 24px 4px' }}>
          <button
            onClick={() => setOpen(true)}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              border: '1.5px solid rgba(99,102,241,0.35)',
              background: 'rgba(99,102,241,0.08)',
              color: '#6366f1', fontFamily: 'DM Sans,sans-serif',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            💰 Record Manual Payment
          </button>
        </div>
      )}

      {/* Form panel */}
      {open && (
        <div style={{
          margin: '0 24px 16px',
          padding: 18,
          background: 'var(--bg)',
          border: '1.5px solid rgba(99,102,241,0.25)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              💰 Record Manual Payment
            </div>
            <button
              onClick={() => { setOpen(false); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 18 }}
            >✕</button>
          </div>

          {/* Student context strip */}
          <div style={{
            padding: '8px 12px', borderRadius: 9,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--bd)',
            fontSize: 12, color: 'var(--m)',
          }}>
            <strong style={{ color: 'var(--text)' }}>{student.student_name}</strong>
            {' · '}{student.class_grade}
            {' · '}{student.school_name ?? student.parent_school ?? '—'}
            {' · '}{student.program_name ?? '—'}
          </div>

          {/* Gateway / Method */}
          <div>
            <label style={LBL}>Payment Method *</label>
            <select
              value={gateway}
              onChange={e => setGateway(e.target.value)}
              style={{ ...INP, cursor: 'pointer', appearance: 'none' as any }}
            >
              <option value="">— Select gateway / method —</option>
              {['Online Gateway', 'Offline / Manual'].map(grp => (
                <optgroup key={grp} label={grp}>
                  {GATEWAY_OPTIONS.filter(o => o.group === grp).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Transaction ID */}
          <div>
            <label style={LBL}>
              Transaction / Reference ID
              <span style={{ color: 'var(--m2)', fontWeight: 400, textTransform: 'none', marginLeft: 4 }}>
                (optional but recommended)
              </span>
            </label>
            <input
              type="text"
              value={txnId}
              onChange={e => setTxnId(e.target.value)}
              placeholder={gateway ? TXN_PLACEHOLDER[gateway] ?? 'Reference number' : 'Select a method first'}
              style={INP}
            />
          </div>

          {/* Amount row */}
          <div style={GRID2}>
            <div>
              <label style={LBL}>Base Amount ({currency})</label>
              <input
                type="number" min="0" step="0.01"
                value={baseAmt}
                onChange={e => handleBaseChange(e.target.value)}
                style={INP}
              />
            </div>
            <div>
              <label style={LBL}>Discount Amount ({currency})</label>
              <input
                type="number" min="0" step="0.01"
                value={discountAmt}
                onChange={e => handleDiscountChange(e.target.value)}
                style={INP}
              />
            </div>
          </div>

          {/* Discount code + final amount */}
          <div style={GRID2}>
            <div>
              <label style={LBL}>Discount Code</label>
              <input
                type="text"
                value={discountCode}
                onChange={e => setDiscountCode(e.target.value)}
                placeholder="THYNK20 (optional)"
                style={INP}
              />
            </div>
            <div>
              <label style={LBL}>Final Amount ({currency}) *</label>
              <input
                type="number" min="0" step="0.01"
                value={finalAmt}
                onChange={e => setFinalAmt(e.target.value)}
                style={{ ...INP, fontWeight: 700, color: 'var(--green)' }}
              />
            </div>
          </div>

          {/* Date & time of payment */}
          <div>
            <label style={LBL}>Payment Date & Time *</label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={e => setPaidAt(e.target.value)}
              style={INP}
            />
          </div>

          {/* Internal notes */}
          <div>
            <label style={LBL}>
              Internal Notes
              <span style={{ color: 'var(--m2)', fontWeight: 400, textTransform: 'none', marginLeft: 4 }}>
                (admin only, not sent to student)
              </span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Collected by office, DD submitted, etc."
              rows={2}
              style={{ ...INP, resize: 'vertical', minHeight: 54 }}
            />
          </div>

          {/* Summary preview */}
          {gateway && finalAmt && parseFloat(finalAmt) > 0 && (
            <div style={{
              padding: '10px 13px', borderRadius: 9,
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.2)',
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Payment Summary
              </div>
              <div style={{ color: 'var(--text)', lineHeight: 1.7 }}>
                <span style={{ color: 'var(--m)' }}>Method:</span>{' '}
                {GATEWAY_OPTIONS.find(o => o.value === gateway)?.label ?? gateway}
                {txnId && <><br /><span style={{ color: 'var(--m)' }}>Txn ID:</span>{' '}<code style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>{txnId}</code></>}
                <br />
                <span style={{ color: 'var(--m)' }}>Amount:</span>{' '}
                {currency}{parseFloat(finalAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                {parseFloat(discountAmt) > 0 && (
                  <span style={{ color: '#a78bfa', marginLeft: 6 }}>
                    (saved {currency}{parseFloat(discountAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}{discountCode ? ` with ${discountCode}` : ''})
                  </span>
                )}
                <br />
                <span style={{ color: 'var(--m)' }}>Paid at:</span>{' '}
                {paidAt ? new Date(paidAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) : '—'}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--m)' }}>
                ⚡ Will fire <strong>registration.created</strong> + <strong>payment.paid</strong> triggers (same as online payment)
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 9,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', fontSize: 12,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setOpen(false); setError(''); }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: '1.5px solid var(--bd)', background: 'var(--card)',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', color: 'var(--m)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !gateway || !finalAmt || parseFloat(finalAmt) <= 0}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 10,
                border: 'none', background: saving ? 'rgba(99,102,241,0.5)' : '#6366f1',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', color: '#fff',
                opacity: (!gateway || !finalAmt || parseFloat(finalAmt) <= 0) ? 0.55 : 1,
              }}
            >
              {saving ? '⏳ Recording…' : '✅ Confirm & Record Payment'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
