'use client';
// components/admin/AdminApprovalQueue.tsx
// Shows pending/registered schools with Approve/Reject actions
// Used inside SchoolsPageWithApproval

import React, { useState } from 'react';

type Row = Record<string, any>;

interface ApprovalQueueProps {
  pendingSchools: Row[];
  programs:       Row[];
  BACKEND:        string;
  authHeaders:    () => HeadersInit;
  onRefresh:      () => void;
  showToast:      (text: string, icon?: string) => void;
}

const IS: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--bd)',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--card)',
  boxSizing: 'border-box' as any,
};

// ── Approve Modal ──────────────────────────────────────────────────
function ApproveModal({
  school,
  programs,
  onClose,
  onApprove,
}: {
  school:    Row;
  programs:  Row[];
  onClose:   () => void;
  onApprove: (schoolId: string, schoolCode: string, pricingAmount?: number) => Promise<void>;
}) {
  const suggestedCode = school.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);

  const program        = programs.find(p => p.id === school.project_id);
  const isIndia        = (school.country || 'India').toLowerCase() === 'india';
  const basePriceLabel = program
    ? isIndia
      ? program.base_amount_inr
        ? `₹${(program.base_amount_inr / 100).toLocaleString('en-IN')}`
        : '—'
      : program.base_amount_usd
      ? `$${(program.base_amount_usd / 100).toLocaleString()}`
      : '—'
    : '—';

  const [schoolCode,    setSchoolCode]    = useState(suggestedCode);
  const [pricingAmount, setPricingAmount] = useState('');
  const [loading,       setLoading]       = useState(false);

  async function handleApprove() {
    if (!schoolCode.trim()) { alert('School code is required'); return; }
    setLoading(true);
    await onApprove(
      school.id,
      schoolCode.trim(),
      pricingAmount ? Math.round(Number(pricingAmount) * 100) : undefined
    );
    setLoading(false);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 18, padding: 28,
        maxWidth: 500, width: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 18, margin: 0 }}>
            ✅ Approve School
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--m)' }}>✕</button>
        </div>

        {/* School info */}
        <div style={{ background: 'var(--acc3)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{school.name}</div>
          <div style={{ fontSize: 12, color: 'var(--m)' }}>
            {[school.city, school.state, school.country].filter(Boolean).join(', ')}
          </div>
          {school.contact_persons?.[0] && (
            <div style={{ fontSize: 12, color: 'var(--m)', marginTop: 4 }}>
              Contact: {school.contact_persons[0].name} · {school.contact_persons[0].mobile}
            </div>
          )}
          {school.address && (
            <div style={{ fontSize: 11, color: 'var(--m2)', marginTop: 2 }}>{school.address}</div>
          )}
        </div>

        {/* School code input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--m)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            School Code * <span style={{ color: 'var(--m)', fontWeight: 400, textTransform: 'none' }}>(used in registration URL)</span>
          </label>
          <input
            style={{ ...IS, fontFamily: 'monospace', textTransform: 'lowercase' }}
            value={schoolCode}
            onChange={e => setSchoolCode(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="e.g. delhi-dps"
          />
          {schoolCode && program && (
            <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              URL: {program.base_url || 'https://www.thynksuccess.com'}/registration/{program.slug}/?school={schoolCode}
            </div>
          )}
        </div>

        {/* Pricing */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--m)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Pricing ({isIndia ? 'INR ₹' : 'USD $'})
            <span style={{ fontWeight: 400, textTransform: 'none' }}>
              {' '}— leave blank to use program base ({basePriceLabel})
            </span>
          </label>
          <input
            style={IS}
            type="number"
            value={pricingAmount}
            onChange={e => setPricingAmount(e.target.value)}
            placeholder={basePriceLabel !== '—' ? `Default: ${basePriceLabel}` : 'Enter amount'}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1.5px solid var(--bd)',
              borderRadius: 10, padding: '9px 18px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={loading || !schoolCode.trim()}
            style={{
              background: loading ? 'var(--m)' : '#10b981',
              border: 'none', borderRadius: 10, padding: '9px 20px',
              fontSize: 13, fontWeight: 700, color: '#fff',
              cursor: loading || !schoolCode.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Approving…' : '✅ Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ApprovalQueue component ───────────────────────────────────
export default function AdminApprovalQueue({
  pendingSchools,
  programs,
  BACKEND,
  authHeaders,
  onRefresh,
  showToast,
}: ApprovalQueueProps) {
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);

  const registered      = pendingSchools.filter(s => s.status === 'registered');
  const pendingApproval = pendingSchools.filter(s => s.status === 'pending_approval');
  const allPending      = [...pendingApproval, ...registered];

  async function handleApprove(schoolId: string, schoolCode: string, pricingAmount?: number) {
    const res = await fetch(`${BACKEND}/api/admin/schools/approve`, {
      method:  'PATCH',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: schoolId, action: 'approve', school_code: schoolCode, pricing_amount: pricingAmount }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Approval failed', '❌');
      return;
    }
    showToast(`School approved! URL: ${data.reg_url}`, '✅');
    setApproveTarget(null);
    onRefresh();
  }

  async function handleReject(schoolId: string, schoolName: string) {
    if (!confirm(`Reject registration for "${schoolName}"? This will reset their status.`)) return;
    const res = await fetch(`${BACKEND}/api/admin/schools/approve`, {
      method:  'PATCH',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: schoolId, action: 'reject' }),
    });
    if (res.ok) {
      showToast('School registration rejected', '');
      onRefresh();
    } else {
      const data = await res.json();
      showToast(data.error || 'Reject failed', '❌');
    }
  }

  if (allPending.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--m)', fontSize: 14 }}>
        🎉 No pending school approvals
      </div>
    );
  }

  return (
    <>
      {approveTarget && (
        <ApproveModal
          school={approveTarget}
          programs={programs}
          onClose={() => setApproveTarget(null)}
          onApprove={handleApprove}
        />
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Pending Approval', count: pendingApproval.length, color: '#f59e0b' },
          { label: 'Newly Registered', count: registered.length,      color: '#4f46e5' },
          { label: 'Total Queue',      count: allPending.length,       color: '#10b981' },
        ].map(s => (
          <div
            key={s.label}
            style={{
              background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 10,
              padding: '10px 16px', flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 22, color: s.color, fontFamily: 'Sora, sans-serif' }}>
              {s.count}
            </span>
            <span style={{ fontSize: 12, color: 'var(--m)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>School Name</th>
              <th>Location</th>
              <th>Contact</th>
              <th>Program</th>
              <th>Applied</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allPending.map(s => {
              const program      = programs.find(p => p.id === s.project_id);
              const contact      = s.contact_persons?.[0];
              const statusColor  = s.status === 'pending_approval' ? 'badge-initiated' : 'badge-pending';
              const statusLabel  = s.status === 'pending_approval' ? 'Pending Approval' : 'Registered';

              return (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--m)' }}>
                    {[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}
                    {s.pin_code && <div style={{ fontSize: 11, color: 'var(--m2)' }}>PIN: {s.pin_code}</div>}
                    {s.address && (
                      <div
                        style={{ fontSize: 11, color: 'var(--m2)', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={s.address}
                      >
                        {s.address}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {contact ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{contact.name}</div>
                        <div style={{ color: 'var(--m)' }}>{contact.designation}</div>
                        <a href={`tel:${contact.mobile}`} style={{ color: 'var(--acc)', textDecoration: 'none' }}>{contact.mobile}</a>
                        {contact.email && <div style={{ fontSize: 11, color: 'var(--m)' }}>{contact.email}</div>}
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{program?.name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--m)' }}>
                    {new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <span className={`badge ${statusColor}`}>{statusLabel}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '5px 12px', background: '#10b981', borderColor: '#10b981' }}
                        onClick={() => setApproveTarget(s)}
                      >
                        ✅ Approve
                      </button>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '5px 12px', background: 'var(--red2)', color: 'var(--red)', border: 'none' }}
                        onClick={() => handleReject(s.id, s.name)}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
