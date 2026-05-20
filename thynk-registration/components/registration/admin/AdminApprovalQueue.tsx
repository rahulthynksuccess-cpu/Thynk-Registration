'use client';
// components/admin/AdminApprovalQueue.tsx
// Approval queue with: filters, delete, bulk approve/reject/delete

import React, { useState, useMemo } from 'react';

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
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)',
  boxSizing: 'border-box' as any,
};

// ── Approve Modal ──────────────────────────────────────────────────
function ApproveModal({ school, programs, onClose, onApprove }: {
  school: Row; programs: Row[];
  onClose: () => void;
  onApprove: (schoolId: string, schoolCode: string, pricingAmount?: number) => Promise<void>;
}) {
  const suggestedCode = school.name
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    .replace(/\s+/g, '-').slice(0, 30);

  const program        = programs.find(p => p.id === school.project_id);
  const isIndia        = (school.country || 'India').toLowerCase() === 'india';
  const basePriceLabel = program
    ? isIndia
      ? program.base_amount_inr ? `₹${(program.base_amount_inr / 100).toLocaleString('en-IN')}` : '—'
      : program.base_amount_usd ? `$${(program.base_amount_usd / 100).toLocaleString()}` : '—'
    : '—';

  const [schoolCode,    setSchoolCode]    = useState(suggestedCode);
  const [pricingAmount, setPricingAmount] = useState('');
  const [loading,       setLoading]       = useState(false);

  async function handleApprove() {
    if (!schoolCode.trim()) { alert('School code is required'); return; }
    setLoading(true);
    await onApprove(school.id, schoolCode.trim(), pricingAmount ? Math.round(Number(pricingAmount) * 100) : undefined);
    setLoading(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card)', borderRadius: 18, padding: 28, maxWidth: 500, width: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 18, margin: 0 }}>✅ Approve School</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--m)' }}>✕</button>
        </div>
        <div style={{ background: 'var(--acc3)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{school.name}</div>
          <div style={{ fontSize: 12, color: 'var(--m)' }}>{[school.city, school.state, school.country].filter(Boolean).join(', ')}</div>
          {school.contact_persons?.[0] && (
            <div style={{ fontSize: 12, color: 'var(--m)', marginTop: 4 }}>
              Contact: {school.contact_persons[0].name} · {school.contact_persons[0].mobile}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--m)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            School Code * <span style={{ color: 'var(--m)', fontWeight: 400, textTransform: 'none' }}>(used in registration URL)</span>
          </label>
          <input style={{ ...IS, fontFamily: 'monospace', textTransform: 'lowercase' }} value={schoolCode}
            onChange={e => setSchoolCode(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="e.g. delhi-dps" />
          {schoolCode && program && (
            <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              URL: {program.base_url || 'https://www.thynksuccess.com'}/registration/{program.slug}/?school={schoolCode}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--m)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Pricing ({isIndia ? 'INR ₹' : 'USD $'}) <span style={{ fontWeight: 400, textTransform: 'none' }}>— leave blank to use program base ({basePriceLabel})</span>
          </label>
          <input style={IS} type="number" value={pricingAmount} onChange={e => setPricingAmount(e.target.value)}
            placeholder={basePriceLabel !== '—' ? `Default: ${basePriceLabel}` : 'Enter amount'} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1.5px solid var(--bd)', borderRadius: 10, padding: '9px 18px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
          <button onClick={handleApprove} disabled={loading || !schoolCode.trim()}
            style={{ background: loading ? 'var(--m)' : '#10b981', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: loading || !schoolCode.trim() ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Approving…' : '✅ Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Action Bar ────────────────────────────────────────────────
function BulkBar({ count, onApprove, onReject, onDelete, loading }: {
  count: number; loading: boolean;
  onApprove: () => void; onReject: () => void; onDelete: () => void;
}) {
  if (count === 0) return null;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', marginBottom: 12,
      background: 'rgba(79,70,229,0.08)', border: '1.5px solid var(--acc)',
      borderRadius: 12, backdropFilter: 'blur(4px)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--acc)', flex: 1 }}>
        {count} school{count !== 1 ? 's' : ''} selected
      </span>
      <button onClick={onApprove} disabled={loading} style={{
        padding: '7px 16px', borderRadius: 8, border: 'none', background: '#10b981',
        color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
      }}>✅ Approve All</button>
      <button onClick={onReject} disabled={loading} style={{
        padding: '7px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)',
        color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
      }}>✕ Reject All</button>
      <button onClick={onDelete} disabled={loading} style={{
        padding: '7px 16px', borderRadius: 8, border: '1.5px solid #ef4444',
        background: 'rgba(239,68,68,0.08)', color: '#ef4444',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
      }}>🗑 Delete All</button>
    </div>
  );
}

// ── Main ApprovalQueue ─────────────────────────────────────────────
export default function AdminApprovalQueue({
  pendingSchools, programs, BACKEND, authHeaders, onRefresh, showToast,
}: ApprovalQueueProps) {
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);

  // ── Filters
  const [search,        setSearch]        = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterState,   setFilterState]   = useState('');

  // ── Selection
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const registered      = pendingSchools.filter(s => s.status === 'registered');
  const pendingApproval = pendingSchools.filter(s => s.status === 'pending_approval');
  const allPending      = [...pendingApproval, ...registered];

  // Unique states for filter dropdown
  const states = useMemo(() => {
    const s = new Set(allPending.map(s => s.state).filter(Boolean));
    return Array.from(s).sort();
  }, [allPending]);

  // Filtered list
  const filtered = useMemo(() => {
    return allPending.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.name?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q) ||
        s.pin_code?.includes(q) ||
        s.contact_persons?.[0]?.name?.toLowerCase().includes(q) ||
        s.contact_persons?.[0]?.mobile?.includes(q) ||
        s.contact_persons?.[0]?.email?.toLowerCase().includes(q);
      const matchProgram = !filterProgram || s.project_id === filterProgram;
      const matchStatus  = !filterStatus  || s.status === filterStatus;
      const matchState   = !filterState   || s.state === filterState;
      return matchSearch && matchProgram && matchStatus && matchState;
    });
  }, [allPending, search, filterProgram, filterStatus, filterState]);

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  }

  // ── Individual actions ─────────────────────────────────────────
  async function handleApprove(schoolId: string, schoolCode: string, pricingAmount?: number) {
    const res = await fetch(`${BACKEND}/api/admin/schools/approve`, {
      method: 'PATCH',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schoolId, action: 'approve', school_code: schoolCode, pricing_amount: pricingAmount }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Approval failed', '❌'); return; }
    showToast(`School approved! URL: ${data.reg_url}`, '✅');
    setApproveTarget(null);
    setSelected(prev => { const n = new Set(prev); n.delete(schoolId); return n; });
    onRefresh();
  }

  async function handleReject(schoolId: string, schoolName: string) {
    if (!confirm(`Reject registration for "${schoolName}"? This will reset their status.`)) return;
    const res = await fetch(`${BACKEND}/api/admin/schools/approve`, {
      method: 'PATCH',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schoolId, action: 'reject' }),
    });
    if (res.ok) { showToast('School registration rejected', ''); onRefresh(); }
    else { const d = await res.json(); showToast(d.error || 'Reject failed', '❌'); }
  }

  async function handleDelete(schoolId: string, schoolName: string) {
    if (!confirm(`Permanently delete "${schoolName}"? This cannot be undone.`)) return;
    const res = await fetch(`${BACKEND}/api/admin/schools`, {
      method: 'DELETE',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schoolId }),
    });
    if (res.ok) { showToast('School deleted', '🗑'); onRefresh(); }
    else { const d = await res.json(); showToast(d.error || 'Delete failed', '❌'); }
  }

  // ── Bulk actions ───────────────────────────────────────────────
  async function bulkReject() {
    if (!confirm(`Reject ${selected.size} school(s)?`)) return;
    setBulkLoading(true);
    let ok = 0;
    for (const id of selected) {
      const res = await fetch(`${BACKEND}/api/admin/schools/approve`, {
        method: 'PATCH',
        headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' }),
      });
      if (res.ok) ok++;
    }
    setBulkLoading(false);
    showToast(`${ok} school(s) rejected`, '');
    setSelected(new Set());
    onRefresh();
  }

  async function bulkDelete() {
    if (!confirm(`Permanently delete ${selected.size} school(s)? This cannot be undone.`)) return;
    setBulkLoading(true);
    let ok = 0;
    for (const id of selected) {
      const res = await fetch(`${BACKEND}/api/admin/schools`, {
        method: 'DELETE',
        headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) ok++;
    }
    setBulkLoading(false);
    showToast(`${ok} school(s) deleted`, '🗑');
    setSelected(new Set());
    onRefresh();
  }

  function bulkApprove() {
    // For bulk approve we need school codes — open individual modals one by one
    // since each needs a unique code. Show a note.
    showToast('For bulk approve: use individual Approve buttons to set school codes', 'ℹ️');
  }

  const inpSm: React.CSSProperties = {
    padding: '7px 10px', fontSize: 12, border: '1.5px solid var(--bd)',
    borderRadius: 8, background: 'var(--card)', color: 'var(--text)',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', cursor: 'pointer',
  };

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
        <ApproveModal school={approveTarget} programs={programs}
          onClose={() => setApproveTarget(null)} onApprove={handleApprove} />
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Pending Approval', count: pendingApproval.length, color: '#f59e0b' },
          { label: 'Newly Registered', count: registered.length,      color: '#4f46e5' },
          { label: 'Total Queue',      count: allPending.length,       color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 16px', flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 22, color: s.color, fontFamily: 'Sora, sans-serif' }}>{s.count}</span>
            <span style={{ fontSize: 12, color: 'var(--m)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--m)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city, contact…"
            style={{ ...inpSm, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }}
          />
        </div>
        {/* Program filter */}
        <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)} style={inpSm}>
          <option value="">All Programs</option>
          {programs.filter(p => p.status === 'active').map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {/* Status filter */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inpSm}>
          <option value="">All Statuses</option>
          <option value="registered">Registered</option>
          <option value="pending_approval">Pending Approval</option>
        </select>
        {/* State filter */}
        {states.length > 0 && (
          <select value={filterState} onChange={e => setFilterState(e.target.value)} style={inpSm}>
            <option value="">All States</option>
            {states.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        )}
        {/* Clear filters */}
        {(search || filterProgram || filterStatus || filterState) && (
          <button onClick={() => { setSearch(''); setFilterProgram(''); setFilterStatus(''); setFilterState(''); }}
            style={{ ...inpSm, color: 'var(--acc)', fontWeight: 700, border: '1.5px solid var(--acc)', background: 'var(--acc3)' }}>
            ✕ Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--m)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {filtered.length} of {allPending.length} shown
        </span>
      </div>

      {/* ── Bulk action bar ── */}
      <BulkBar count={selected.size} loading={bulkLoading}
        onApprove={bulkApprove} onReject={bulkReject} onDelete={bulkDelete} />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--m)', fontSize: 13 }}>
          No schools match the current filters.
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                </th>
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
              {filtered.map(s => {
                const program     = programs.find(p => p.id === s.project_id);
                const contact     = s.contact_persons?.[0];
                const statusColor = s.status === 'pending_approval' ? 'badge-initiated' : 'badge-pending';
                const statusLabel = s.status === 'pending_approval' ? 'Pending Approval' : 'Registered';
                const isSelected  = selected.has(s.id);

                return (
                  <tr key={s.id} style={{ background: isSelected ? 'rgba(79,70,229,0.05)' : undefined }}>
                    <td>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(s.id)}
                        style={{ cursor: 'pointer', width: 15, height: 15 }} />
                    </td>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--m)' }}>
                      {[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}
                      {s.pin_code && <div style={{ fontSize: 11, color: 'var(--m2)' }}>PIN: {s.pin_code}</div>}
                      {s.address && (
                        <div style={{ fontSize: 11, color: 'var(--m2)', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.address}>
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
                    <td><span className={`badge ${statusColor}`}>{statusLabel}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: '5px 10px', background: '#10b981', borderColor: '#10b981' }}
                          onClick={() => setApproveTarget(s)}
                        >✅ Approve</button>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '5px 10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none' }}
                          onClick={() => handleReject(s.id, s.name)}
                        >✕ Reject</button>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '5px 10px', background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                          onClick={() => handleDelete(s.id, s.name)}
                        >🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
