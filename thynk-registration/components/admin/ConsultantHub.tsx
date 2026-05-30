'use client';
/**
 * components/admin/ConsultantHub.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the inline ConsultantsTab inside admin/page.tsx
 *
 * Four inner tabs:
 *  1. 📥 Pending     — online registration approval queue
 *  2. 👥 Consultants — full profile list of approved consultants
 *  3. 📊 Analytics   — business performance (existing leaderboard + breakdowns)
 *  4. 💬 Communicate — template-based Email / WhatsApp broadcast to consultants
 *
 * Props mirror the old ConsultantsTab so admin/page.tsx needs minimal changes.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;

// ── Shared styles ─────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontFamily: 'DM Sans,sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box',
};
const SS: React.CSSProperties = { ...IS, appearance: 'none' as any, cursor: 'pointer' };
const LB: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)',
  textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5,
};
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const fmtR = (p: number) => { const v = p / 100; return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const COLORS = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16'];

const DOMAIN_OPTS = [
  'Academics',
  'School Operations',
  'Edtech Sales K12',
  'Edtech Sales Higher Education',
  'Others',
];

// ── SmtpOption type (mirrors LeadDatabase) ────────────────────────────────────
type SmtpOption = {
  id: string; name: string; fromName: string;
  fromEmail: string; smtpUser: string; program_id: string | null;
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export function ConsultantHub({
  consultants,
  schools,
  allRows,
  programs,
  authHeaders,
  isSuperAdmin,
  onReload,
  showToast,
  consultantForm,
  setConsultantForm,
}: {
  consultants:      Row[];
  schools:          Row[];
  allRows:          Row[];
  programs:         Row[];
  authHeaders:      () => HeadersInit;
  isSuperAdmin:     boolean;
  onReload:         () => void;
  showToast:        (m: string, i?: string) => void;
  consultantForm:   Row | null;
  setConsultantForm:(r: Row | null) => void;
}) {
  const [tab, setTab] = useState<'pending'|'approved'|'analytics'|'communicate'>('pending');
  const [pendingRegs, setPendingRegs] = useState<Row[]>([]);
  const [approvedRegs, setApprovedRegs] = useState<Row[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);

  // Build school→consultant lookup for analytics
  const schoolConsultantMap: Record<string, string> = {};
  schools.forEach(s => { if (s.consultant_id) schoolConsultantMap[s.id] = s.consultant_id; });
  const enrichedRows: Row[] = allRows.map(r => ({
    ...r,
    consultant_id: r.consultant_id ?? schoolConsultantMap[r.school_id] ?? null,
  }));

  // Load registrations
  const loadRegs = useCallback(async () => {
    setRegsLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/consultant-registrations?status=pending`),
        authFetch(`${BACKEND}/api/admin/consultant-registrations?status=approved`),
      ]);
      const [pData, aData] = await Promise.all([pRes.json(), aRes.json()]);
      setPendingRegs(pData.registrations ?? []);
      setApprovedRegs(aData.registrations ?? []);
    } catch {}
    setRegsLoading(false);
  }, []);

  useEffect(() => { loadRegs(); }, [loadRegs]);

  const TAB_DEFS: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'pending',     label: `📥 Pending`, count: pendingRegs.length },
    { id: 'approved',    label: '👥 Approved Consultants' },
    { id: 'analytics',  label: '📊 Analytics' },
    { id: 'communicate', label: '💬 Communicate' },
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Portal URL banner */}
      <div style={{ background:'rgba(79,70,229,.06)', border:'1.5px solid rgba(79,70,229,.2)', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ fontSize:22 }}>🤝</div>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#4f46e5', marginBottom:3 }}>Consultant Registration Form</div>
          <div style={{ fontSize:11, color:'var(--m)', marginBottom:4 }}>Embed this URL in WordPress via an iframe, or share directly with prospective consultants.</div>
          <code style={{ fontFamily:'monospace', fontSize:11, color:'var(--text)', background:'var(--bg)', padding:'5px 10px', borderRadius:6, display:'inline-block', wordBreak:'break-all' }}>
            {(BACKEND||'https://thynk-registration.vercel.app')}/consultant-register.html
          </code>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => { navigator.clipboard.writeText(`${BACKEND||'https://thynk-registration.vercel.app'}/consultant-register.html`); showToast('Form URL copied!','📋'); }}
            style={{ padding:'8px 14px', borderRadius:9, background:'#4f46e5', border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            📋 Copy URL
          </button>
          <DownloadReportBtn authHeaders={authHeaders} showToast={showToast} />
          {isSuperAdmin && (
            <button onClick={() => setConsultantForm({})}
              style={{ padding:'8px 14px', borderRadius:9, background:'transparent', border:'1.5px solid #4f46e5', color:'#4f46e5', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              + Add Manually
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--bg)', borderRadius:12, padding:4, width:'fit-content', flexWrap:'wrap' }}>
        {TAB_DEFS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 16px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, borderRadius:9,
              fontFamily:'DM Sans,sans-serif', transition:'all .18s',
              background: tab === t.id ? 'var(--acc)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--m)',
              boxShadow: tab === t.id ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
              display:'flex', alignItems:'center', gap:6,
            }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ background: tab===t.id ? 'rgba(255,255,255,0.3)' : '#ef4444', color:'#fff', borderRadius:20, fontSize:10, padding:'1px 7px', fontWeight:800 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending Tab ── */}
      {tab === 'pending' && (
        <PendingTab
          registrations={pendingRegs}
          loading={regsLoading}
          authHeaders={authHeaders}
          onRefresh={() => { loadRegs(); onReload(); }}
          showToast={showToast}
        />
      )}

      {/* ── Approved Tab ── */}
      {tab === 'approved' && (
        <ApprovedTab
          consultants={consultants}
          registrations={approvedRegs}
          enrichedRows={enrichedRows}
          isSuperAdmin={isSuperAdmin}
          authHeaders={authHeaders}
          onReload={onReload}
          showToast={showToast}
          setConsultantForm={setConsultantForm}
        />
      )}

      {/* ── Analytics Tab ── */}
      {tab === 'analytics' && (
        <ConsultantAnalytics consultants={consultants} enrichedRows={enrichedRows} schools={schools} colors={COLORS} />
      )}

      {/* ── Communicate Tab ── */}
      {tab === 'communicate' && (
        <CommunicateTab
          consultants={consultants}
          authHeaders={authHeaders}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: PENDING REGISTRATIONS  (with bulk approve / reject)
// ═════════════════════════════════════════════════════════════════════════════
function PendingTab({ registrations, loading, authHeaders, onRefresh, showToast }: {
  registrations: Row[];
  loading:       boolean;
  authHeaders:   () => HeadersInit;
  onRefresh:     () => void;
  showToast:     (m: string, i?: string) => void;
}) {
  const [actionTarget,  setActionTarget]  = useState<Row | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<Row | null>(null);
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [search,        setSearch]        = useState('');

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkProgress,  setBulkProgress]  = useState<{ done: number; total: number } | null>(null);
  const [bulkRejectBox, setBulkRejectBox] = useState(false);
  const [bulkReason,    setBulkReason]    = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return registrations;
    const q = search.toLowerCase();
    return registrations.filter(r =>
      r.full_name?.toLowerCase().includes(q) ||
      r.contact_email?.toLowerCase().includes(q) ||
      r.location?.toLowerCase().includes(q)
    );
  }, [registrations, search]);

  // Keep selected in sync when filter changes
  const filteredIds = useMemo(() => new Set(filtered.map((r: Row) => r.id as string)), [filtered]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((r: Row) => selected.has(r.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const s = new Set(prev); filtered.forEach((r: Row) => s.delete(r.id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); filtered.forEach((r: Row) => s.add(r.id)); return s; });
    }
  }
  function toggleOne(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function clearSelection() { setSelected(new Set()); }

  // ── Single approve ────────────────────────────────────────────────────────
  async function approve(reg: Row) {
    try {
      const res  = await authFetch(`${BACKEND}/api/admin/consultant-registrations`, {
        method:  'PATCH',
        headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: reg.id, action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Approval failed', '❌'); return; }
      showToast(`✅ Approved! Code: ${data.consultant_code} | Password: Thynk@1234`, '✅');
      onRefresh();
    } catch (e: any) { showToast(e.message, '❌'); }
    setActionTarget(null);
  }

  // ── Single reject ─────────────────────────────────────────────────────────
  async function reject(reg: Row, reason: string) {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/consultant-registrations`, {
        method:  'PATCH',
        headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: reg.id, action: 'reject', reject_reason: reason }),
      });
      if (res.ok) { showToast('Registration rejected', '🗑️'); onRefresh(); }
      else { const d = await res.json(); showToast(d.error ?? 'Failed', '❌'); }
    } catch (e: any) { showToast(e.message, '❌'); }
    setRejectTarget(null);
  }

  // ── Bulk approve ──────────────────────────────────────────────────────────
  async function bulkApprove() {
    const ids = [...selected].filter(id => filteredIds.has(id));
    if (!ids.length) return;
    setBulkApproving(true);
    setBulkProgress({ done: 0, total: ids.length });
    let ok = 0; let fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const res  = await authFetch(`${BACKEND}/api/admin/consultant-registrations`, {
          method:  'PATCH',
          headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: ids[i], action: 'approve' }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
      setBulkProgress({ done: i + 1, total: ids.length });
      // Small delay to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 300));
    }
    setBulkApproving(false);
    setBulkProgress(null);
    clearSelection();
    showToast(`✅ Bulk approved: ${ok} approved${fail > 0 ? `, ${fail} failed` : ''}`, ok > 0 ? '✅' : '❌');
    onRefresh();
  }

  // ── Bulk reject ───────────────────────────────────────────────────────────
  async function bulkReject() {
    const ids = [...selected].filter(id => filteredIds.has(id));
    if (!ids.length) return;
    setBulkRejecting(true);
    setBulkRejectBox(false);
    setBulkProgress({ done: 0, total: ids.length });
    let ok = 0; let fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await authFetch(`${BACKEND}/api/admin/consultant-registrations`, {
          method:  'PATCH',
          headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: ids[i], action: 'reject', reject_reason: bulkReason.trim() || null }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
      setBulkProgress({ done: i + 1, total: ids.length });
      await new Promise(r => setTimeout(r, 200));
    }
    setBulkRejecting(false);
    setBulkProgress(null);
    setBulkReason('');
    clearSelection();
    showToast(`Bulk rejected: ${ok} rejected${fail > 0 ? `, ${fail} failed` : ''}`, '🗑️');
    onRefresh();
  }

  async function deleteReg(id: string) {
    if (!confirm('Delete this registration permanently?')) return;
    await authFetch(`${BACKEND}/api/admin/consultant-registrations`, {
      method:  'DELETE',
      headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    showToast('Deleted', '🗑️');
    onRefresh();
  }

  if (loading) return <Spinner text="Loading registrations…" />;

  const isBulkBusy = bulkApproving || bulkRejecting;

  return (
    <div>
      {/* ── Top bar ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Select all checkbox */}
          <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--m)', userSelect:'none' }}>
            <input type="checkbox"
              checked={allFilteredSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allFilteredSelected; }}
              onChange={toggleAll}
              style={{ width:15, height:15, accentColor:'var(--acc)', cursor:'pointer' }}
            />
            {someSelected ? `${selected.size} selected` : `${registrations.length} pending`}
          </label>
          {someSelected && (
            <button onClick={clearSelection}
              style={{ fontSize:11, color:'var(--m)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0 }}>
              Clear
            </button>
          )}
        </div>
        <input style={{ ...IS, maxWidth:240, padding:'8px 12px', fontSize:13 }}
          placeholder="Search name, email, location…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* ── Bulk action toolbar (slides in when items selected) ── */}
      {someSelected && (
        <div style={{
          display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          padding:'12px 16px', marginBottom:14,
          background:'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(139,92,246,0.06))',
          border:'1.5px solid rgba(79,70,229,0.2)', borderRadius:12,
          animation:'slideDown .18s ease',
        }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--acc)', flex:1 }}>
            {isBulkBusy && bulkProgress
              ? `⏳ Processing… ${bulkProgress.done} / ${bulkProgress.total}`
              : `${selected.size} consultant${selected.size !== 1 ? 's' : ''} selected`
            }
          </div>

          {/* Progress bar */}
          {isBulkBusy && bulkProgress && (
            <div style={{ width:'100%', height:4, background:'var(--bd)', borderRadius:4, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:4, transition:'width .3s',
                width: `${Math.round(bulkProgress.done / bulkProgress.total * 100)}%`,
                background: bulkApproving ? '#10b981' : '#ef4444',
              }} />
            </div>
          )}

          {!isBulkBusy && (
            <>
              <button onClick={bulkApprove}
                style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#10b981', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                ✅ Approve All ({selected.size})
              </button>
              <button onClick={() => setBulkRejectBox(true)}
                style={{ padding:'8px 18px', borderRadius:9, border:'1.5px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.06)', color:'#ef4444', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                ✕ Reject All ({selected.size})
              </button>
              <button onClick={clearSelection}
                style={{ padding:'8px 14px', borderRadius:9, border:'1.5px solid var(--bd)', background:'transparent', color:'var(--m)', fontSize:12, cursor:'pointer' }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Cards ── */}
      {filtered.length === 0 ? (
        <EmptyState icon="📥" title="No pending registrations" sub="Online registrations from the embedded form will appear here for your review." />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map((reg: Row) => (
            <RegistrationCard
              key={reg.id}
              reg={reg}
              expanded={expandedId === reg.id}
              selected={selected.has(reg.id)}
              onSelect={() => toggleOne(reg.id)}
              onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
              onApprove={() => setActionTarget(reg)}
              onReject={() => setRejectTarget(reg)}
              onDelete={() => deleteReg(reg.id)}
            />
          ))}
        </div>
      )}

      {/* ── Single approve confirm ── */}
      {actionTarget && (
        <ConfirmModal
          title="✅ Approve Consultant"
          message={
            <>
              <p style={{ marginBottom:10 }}>Approving <strong>{actionTarget.full_name}</strong> ({actionTarget.contact_email}) will:</p>
              <ul style={{ paddingLeft:18, fontSize:13, color:'var(--m)', lineHeight:1.8 }}>
                <li>Create a login account (User ID = their email)</li>
                <li>Set default password to <code style={{ background:'var(--bg)', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>Thynk@1234</code></li>
                <li>Auto-assign the next consultant code</li>
              </ul>
            </>
          }
          confirmLabel="✅ Approve"
          confirmColor="#10b981"
          onConfirm={() => approve(actionTarget)}
          onClose={() => setActionTarget(null)}
        />
      )}

      {/* ── Single reject modal ── */}
      {rejectTarget && (
        <RejectModal
          reg={rejectTarget}
          onReject={(reason) => reject(rejectTarget, reason)}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {/* ── Bulk reject reason modal ── */}
      {bulkRejectBox && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setBulkRejectBox(false); }}>
          <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:18, padding:'28px', maxWidth:460, width:'100%' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:800, fontFamily:'Sora,sans-serif' }}>✕ Bulk Reject {selected.size} Registrations</h3>
            <p style={{ fontSize:13, color:'var(--m)', marginBottom:18 }}>
              This will reject <strong>{selected.size}</strong> selected registrations. This action cannot be undone.
            </p>
            <div style={{ marginBottom:18 }}>
              <label style={{ ...LB, display:'block' }}>Rejection Reason (optional — applied to all)</label>
              <textarea style={{ ...IS, minHeight:80, lineHeight:1.6 }}
                value={bulkReason} onChange={e => setBulkReason(e.target.value)}
                placeholder="E.g. Profile does not meet our current requirements…" />
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setBulkRejectBox(false)}
                style={{ padding:'9px 20px', borderRadius:10, border:'1.5px solid var(--bd)', background:'transparent', fontSize:13, cursor:'pointer', color:'var(--text)' }}>
                Cancel
              </button>
              <button onClick={bulkReject}
                style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                ✕ Reject All {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegistrationCard({ reg, expanded, selected, onSelect, onToggle, onApprove, onReject, onDelete }: {
  reg: Row; expanded: boolean; selected: boolean;
  onSelect: () => void; onToggle: () => void; onApprove: () => void; onReject: () => void; onDelete: () => void;
}) {
  const domains: string[] = Array.isArray(reg.domain_expertise) ? reg.domain_expertise : [];

  return (
    <div style={{ border:`1.5px solid ${selected ? 'var(--acc)' : 'var(--bd)'}`, borderRadius:14, overflow:'hidden', background: selected ? 'rgba(79,70,229,0.03)' : 'var(--card)', transition:'border-color .15s, background .15s' }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', flexWrap:'wrap' }}>
        {/* Checkbox */}
        <input type="checkbox" checked={selected} onChange={onSelect}
          style={{ width:16, height:16, accentColor:'var(--acc)', cursor:'pointer', flexShrink:0 }} />
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ fontWeight:800, fontSize:15, color:'var(--text)', marginBottom:2 }}>{reg.full_name}</div>
          <div style={{ fontSize:12, color:'var(--m)', display:'flex', gap:14, flexWrap:'wrap' }}>
            <span>📧 {reg.contact_email}</span>
            <span>📱 {reg.contact_number}</span>
            {reg.location && <span>📍 {reg.location}</span>}
            <span style={{ color:'var(--m2)' }}>🕐 {new Date(reg.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
          </div>
        </div>
        {domains.length > 0 && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxWidth:280 }}>
            {domains.slice(0,3).map(d => (
              <span key={d} style={{ fontSize:10, fontWeight:700, background:'rgba(79,70,229,.1)', color:'#4f46e5', borderRadius:20, padding:'2px 9px' }}>{d}</span>
            ))}
            {domains.length > 3 && <span style={{ fontSize:10, fontWeight:700, background:'var(--bg)', color:'var(--m)', borderRadius:20, padding:'2px 9px' }}>+{domains.length-3}</span>}
          </div>
        )}
        <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
          <button onClick={onToggle}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--bd)', background:'var(--bg)', color:'var(--m)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {expanded ? '▲ Less' : '▼ More'}
          </button>
          <button onClick={onApprove}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ✅ Approve
          </button>
          <button onClick={onReject}
            style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.06)', color:'#ef4444', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ✕ Reject
          </button>
          <button onClick={onDelete}
            style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid var(--bd)', background:'var(--bg)', color:'var(--m)', fontSize:12, cursor:'pointer' }}>
            🗑️
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop:'1.5px solid var(--bd)', padding:'18px 20px', background:'var(--bg)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16, marginBottom:18 }}>
            <InfoBlock label="Total Experience" value={reg.total_exp_years ? `${reg.total_exp_years} years` : '—'} />
            <InfoBlock label="Locations Worked" value={reg.locations_worked || '—'} />
            <InfoBlock label="Edu Connections" value={reg.has_edu_connections == null ? '—' : reg.has_edu_connections ? 'Yes ✅' : 'No'} />
            <InfoBlock label="B2B Experience" value={reg.has_b2b_exp == null ? '—' : reg.has_b2b_exp ? 'Yes ✅' : 'No'} />
            <InfoBlock label="B2C Experience" value={reg.has_b2c_exp == null ? '—' : reg.has_b2c_exp ? 'Yes ✅' : 'No'} />
            <InfoBlock label="Domain Expertise" value={domains.join(', ') || '—'} />
          </div>
          {reg.detailed_intro && (
            <div style={{ marginBottom:14 }}>
              <div style={LB}>Detailed Introduction</div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'12px 14px' }}>
                {reg.detailed_intro}
              </div>
            </div>
          )}
          {reg.experience_summary && (
            <div>
              <div style={LB}>Experience Summary</div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'12px 14px' }}>
                {reg.experience_summary}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: APPROVED CONSULTANTS — full profile view
// ═════════════════════════════════════════════════════════════════════════════
function ApprovedTab({ consultants, registrations, enrichedRows, isSuperAdmin, authHeaders, onReload, showToast, setConsultantForm }: {
  consultants:       Row[];
  registrations:     Row[];
  enrichedRows:      Row[];
  isSuperAdmin:      boolean;
  authHeaders:       () => HeadersInit;
  onReload:          () => void;
  showToast:         (m: string, i?: string) => void;
  setConsultantForm: (r: Row | null) => void;
}) {
  const [search,      setSearch]      = useState('');
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [regLinksFor, setRegLinksFor] = useState<Row | null>(null);

  // Merge auth-based consultants with extra profile fields from registrations
  const regByEmail: Record<string, Row> = {};
  registrations.forEach(r => { regByEmail[r.contact_email] = r; });

  const enriched: Row[] = consultants.map(c => ({
    ...c,
    ...(regByEmail[c.email as string] || {}),
    id: c.id,   // keep user id not reg id
  }));

  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.consultant_code?.toLowerCase().includes(q) ||
      c.location?.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  async function handleDelete(id: string) {
    if (!confirm('Remove this consultant? Their schools will remain but become unassigned.')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/consultants`, {
        method:'DELETE',
        headers: { ...(authHeaders() as any), 'Content-Type':'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) { showToast('Consultant removed','🗑️'); onReload(); }
      else { const d = await res.json(); showToast(d.error??'Failed','❌'); }
    } finally { setDeleting(null); }
  }

  if (consultants.length === 0) {
    return <EmptyState icon="👥" title="No approved consultants yet" sub="Approve registrations from the Pending tab, or add consultants manually." />;
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, color:'var(--m)', fontWeight:600 }}>{consultants.length} consultant{consultants.length !== 1 ? 's' : ''}</div>
        <input style={{ ...IS, maxWidth:260, padding:'8px 12px', fontSize:13 }}
          placeholder="Search name, email, code…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {filtered.map(c => {
          const cRows = enrichedRows.filter(r => r.consultant_id === c.id);
          const cPaid = cRows.filter(r => r.payment_status === 'paid');
          const cRev  = cPaid.reduce((s: number, r: Row) => s + (r.final_amount ?? 0), 0);
          const domains: string[] = Array.isArray(c.domain_expertise) ? c.domain_expertise : [];
          const isExpanded = expandedId === c.id;

          return (
            <div key={c.id} style={{ border:'1.5px solid var(--bd)', borderRadius:14, overflow:'hidden', background:'var(--card)' }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', flexWrap:'wrap' }}>
                {/* Avatar */}
                <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#4f46e5,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:16, flexShrink:0 }}>
                  {(c.name || c.email || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                    <span style={{ fontWeight:800, fontSize:15, color:'var(--text)' }}>{c.name || '—'}</span>
                    {c.consultant_code && (
                      <code style={{ fontSize:10, background:'rgba(79,70,229,.1)', color:'#4f46e5', padding:'2px 8px', borderRadius:20, fontWeight:800 }}>{c.consultant_code}</code>
                    )}
                    {c.is_default_consultant && <span title="Default consultant" style={{ fontSize:14 }}>⭐</span>}
                    <span style={{ fontSize:10, background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'2px 8px', fontWeight:700 }}>✅ Active</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--m)', display:'flex', gap:12, flexWrap:'wrap' }}>
                    <span>📧 {c.email}</span>
                    {(c.mobile_number || c.contact_number) && <span>📱 {c.mobile_number || c.contact_number}</span>}
                    {c.location && <span>📍 {c.location}</span>}
                  </div>
                </div>
                {/* KPIs */}
                <div style={{ display:'flex', gap:16, flexShrink:0, flexWrap:'wrap' }}>
                  <Kpi label="Schools"    val={c.school_count} />
                  <Kpi label="Paid"       val={cPaid.length}   color="#10b981" />
                  <Kpi label="Revenue"    val={`₹${fmtR(cRev)}`} color="#f59e0b" />
                </div>
                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--bd)', background:'var(--bg)', color:'var(--m)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    {isExpanded ? '▲ Less' : '▼ Profile'}
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button onClick={() => setConsultantForm(c)}
                        style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid rgba(79,70,229,.3)', background:'rgba(79,70,229,.06)', color:'#4f46e5', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => setRegLinksFor(c)}
                        style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid rgba(79,70,229,.3)', background:'transparent', color:'#4f46e5', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        🔗 Links
                      </button>
                      <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                        style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.06)', color:'#ef4444', fontSize:12, cursor:'pointer' }}>
                        {deleting === c.id ? '⏳' : '🗑️'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded profile */}
              {isExpanded && (
                <div style={{ borderTop:'1.5px solid var(--bd)', padding:'18px 20px', background:'var(--bg)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:14, marginBottom:16 }}>
                    <InfoBlock label="Consultant Code" value={c.consultant_code || '—'} mono />
                    <InfoBlock label="Total Experience" value={c.total_exp_years ? `${c.total_exp_years} years` : '—'} />
                    <InfoBlock label="Locations Worked" value={c.locations_worked || '—'} />
                    <InfoBlock label="Edu Connections" value={c.has_edu_connections == null ? '—' : c.has_edu_connections ? 'Yes ✅' : 'No'} />
                    <InfoBlock label="B2B Experience" value={c.has_b2b_exp == null ? '—' : c.has_b2b_exp ? 'Yes ✅' : 'No'} />
                    <InfoBlock label="B2C Experience" value={c.has_b2c_exp == null ? '—' : c.has_b2c_exp ? 'Yes ✅' : 'No'} />
                    <InfoBlock label="PAN Number" value={c.pan_number || '—'} mono />
                    <InfoBlock label="Joined" value={new Date(c.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })} />
                    <InfoBlock label="Source" value={c.registration_source === 'online' ? '🌐 Online Form' : '👤 Admin Added'} />
                  </div>
                  {domains.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <div style={LB}>Domain Expertise</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {domains.map(d => (
                          <span key={d} style={{ fontSize:12, fontWeight:700, background:'rgba(79,70,229,.1)', color:'#4f46e5', borderRadius:20, padding:'4px 12px' }}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.detailed_intro && (
                    <div style={{ marginBottom:14 }}>
                      <div style={LB}>Detailed Introduction</div>
                      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'12px 14px' }}>{c.detailed_intro}</div>
                    </div>
                  )}
                  {c.experience_summary && (
                    <div>
                      <div style={LB}>Experience Summary</div>
                      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'12px 14px' }}>{c.experience_summary}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {regLinksFor && (
        <RegistrationLinksModal consultant={regLinksFor} programs={[]} BACKEND={BACKEND} onClose={() => setRegLinksFor(null)} showToast={showToast} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: COMMUNICATE
// ═════════════════════════════════════════════════════════════════════════════
function CommunicateTab({ consultants, authHeaders, showToast }: {
  consultants: Row[];
  authHeaders: () => HeadersInit;
  showToast:   (m: string, i?: string) => void;
}) {
  const [channel,       setChannel]       = useState<'email'|'whatsapp'>('email');
  const [templates,     setTemplates]     = useState<Row[]>([]);
  const [smtpOptions,   setSmtpOptions]   = useState<SmtpOption[]>([]);
  const [waProvider,    setWaProvider]    = useState<{ provider: string; label: string } | null>(null);
  const [tplId,         setTplId]         = useState('');
  const [smtpConfigId,  setSmtpConfigId]  = useState('');
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [preview,       setPreview]       = useState('');
  const [sending,       setSending]       = useState(false);
  const [sentLog,       setSentLog]       = useState<{ name: string; to: string; ok: boolean; err?: string }[]>([]);
  const [showLog,       setShowLog]       = useState(false);

  // Load config + templates
  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/broadcast/config`)
      .then(r => r.json())
      .then(d => {
        setSmtpOptions(d.smtpConfigs ?? []);
        if ((d.smtpConfigs ?? []).length > 0) setSmtpConfigId(d.smtpConfigs[0].id);
        if (d.whatsappProvider) setWaProvider(d.whatsappProvider);
      }).catch(() => {});
    authFetch(`${BACKEND}/api/admin/templates`)
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chanTpls = templates.filter(t => t.channel === channel && t.is_active !== false);
  const tpl      = templates.find(t => t.id === tplId);

  // Preview
  useEffect(() => {
    if (!tpl) { setPreview(''); return; }
    setPreview(tpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => `[${k}]`));
  }, [tpl]);

  // Toggle consultant selection
  function toggleAll() {
    if (selected.size === consultants.length) setSelected(new Set());
    else setSelected(new Set(consultants.map(c => c.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function sendAll() {
    if (!tplId || selected.size === 0) return;
    setSending(true);
    setSentLog([]);
    setShowLog(false);
    const log: typeof sentLog = [];

    for (const id of selected) {
      const c = consultants.find(x => x.id === id);
      if (!c) continue;

      const to = channel === 'email' ? c.email : (c.mobile_number || c.contact_number);
      if (!to) {
        log.push({ name: c.name || c.email, to: '—', ok: false, err: 'No contact info' });
        continue;
      }

      const vars = {
        full_name:       c.name || '',
        contact_email:   c.email || '',
        contact_number:  c.mobile_number || c.contact_number || '',
        consultant_code: c.consultant_code || '',
        location:        c.location || '',
      };

      try {
        // Use a dummy school_id — send API requires it but consultant comms don't need school context
        // We pass the consultant user_id as a marker
        const res = await authFetch(`${BACKEND}/api/admin/send`, {
          method: 'POST',
          headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            template_id:    tplId,
            school_id:      '__consultant__',   // handled below — see note
            to_phone:       channel === 'whatsapp' ? to : undefined,
            to_email:       channel === 'email'    ? to : undefined,
            smtp_config_id: channel === 'email' ? smtpConfigId || undefined : undefined,
            vars,
          }),
        });
        // If backend rejects __consultant__ school_id, fall back to direct SMTP logic
        if (res.status === 400 || res.status === 404) {
          // Fallback: call a lightweight direct-send with rendered body
          const rendered = tpl!.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => (vars as any)[k] ?? '');
          const res2 = await authFetch(`${BACKEND}/api/admin/send`, {
            method: 'POST',
            headers: { ...(authHeaders() as any), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel,
              template_id:    tplId,
              school_id:      consultants[0]?.school_id || (await getAnySchoolId()),
              to_phone:       channel === 'whatsapp' ? to : undefined,
              to_email:       channel === 'email'    ? to : undefined,
              smtp_config_id: channel === 'email' ? smtpConfigId || undefined : undefined,
              vars,
            }),
          });
          const d2 = await res2.json();
          log.push({ name: c.name || c.email, to, ok: res2.ok, err: res2.ok ? undefined : d2.error });
        } else {
          const d = await res.json();
          log.push({ name: c.name || c.email, to, ok: res.ok, err: res.ok ? undefined : d.error });
        }
      } catch (err: any) {
        log.push({ name: c.name || c.email, to, ok: false, err: err.message });
      }

      // Small delay to avoid rate-limiting
      await new Promise(r => setTimeout(r, 200));
    }

    setSentLog(log);
    setShowLog(true);
    setSending(false);

    const okCount = log.filter(l => l.ok).length;
    showToast(`Sent ${okCount}/${log.length} messages`, okCount === log.length ? '✅' : '⚠️');
  }

  async function getAnySchoolId(): Promise<string> {
    try {
      const r = await authFetch(`${BACKEND}/api/admin/schools`);
      const d = await r.json();
      return d.schools?.[0]?.id ?? '';
    } catch { return ''; }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>
      {/* Left: config */}
      <div>
        {/* Channel */}
        <div style={{ marginBottom:20 }}>
          <div style={LB}>Channel</div>
          <div style={{ display:'flex', gap:10 }}>
            {(['email','whatsapp'] as const).map(ch => (
              <button key={ch} onClick={() => { setChannel(ch); setTplId(''); }}
                style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1.5px solid',
                  borderColor: channel===ch ? 'var(--acc)' : 'var(--bd)',
                  background: channel===ch ? 'var(--acc3)' : 'var(--card)',
                  color: channel===ch ? 'var(--acc)' : 'var(--m)',
                  fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                {ch === 'email' ? '📧 Email' : '💬 WhatsApp'}
                {ch === 'whatsapp' && waProvider && (
                  <div style={{ fontSize:10, fontWeight:400, marginTop:2, opacity:.8 }}>{waProvider.label}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* SMTP picker */}
        {channel === 'email' && smtpOptions.length > 1 && (
          <div style={{ marginBottom:16 }}>
            <label style={LB}>Send From</label>
            <select style={SS} value={smtpConfigId} onChange={e => setSmtpConfigId(e.target.value)}>
              {smtpOptions.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.fromEmail})</option>
              ))}
            </select>
          </div>
        )}

        {/* Template picker */}
        <div style={{ marginBottom:16 }}>
          <label style={LB}>Template</label>
          {chanTpls.length === 0 ? (
            <div style={{ fontSize:13, color:'var(--m)', padding:'10px 14px', border:'1.5px dashed var(--bd)', borderRadius:10 }}>
              No active {channel} templates. Create templates in Admin → Message Triggers.
            </div>
          ) : (
            <select style={SS} value={tplId} onChange={e => setTplId(e.target.value)}>
              <option value="">— Select template —</option>
              {chanTpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        {/* Template preview */}
        {preview && (
          <div style={{ marginBottom:20, border:'1.5px solid var(--bd)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ background:'var(--bg)', padding:'8px 14px', fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.5px', borderBottom:'1px solid var(--bd)' }}>
              Message Preview
            </div>
            <div style={{ padding:'12px 14px', fontSize:13, color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap', maxHeight:160, overflowY:'auto' }}>
              {preview}
            </div>
          </div>
        )}

        {/* Available variables */}
        <div style={{ marginBottom:20, background:'rgba(79,70,229,.04)', border:'1.5px solid rgba(79,70,229,.15)', borderRadius:10, padding:'10px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--acc)', marginBottom:7, textTransform:'uppercase', letterSpacing:'.5px' }}>Available Variables</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['{{full_name}}','{{contact_email}}','{{contact_number}}','{{consultant_code}}','{{location}}'].map(v => (
              <code key={v} style={{ fontSize:11, background:'var(--card)', border:'1px solid var(--bd)', borderRadius:6, padding:'2px 8px', color:'#4f46e5', fontWeight:700 }}>{v}</code>
            ))}
          </div>
        </div>

        {/* Send button */}
        <button
          onClick={sendAll}
          disabled={sending || !tplId || selected.size === 0}
          style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
            background: (!tplId || selected.size === 0) ? 'var(--bd)' : 'linear-gradient(135deg,#4f46e5,#8b5cf6)',
            color:'#fff', fontSize:15, fontWeight:700, cursor: (!tplId || selected.size === 0) ? 'not-allowed' : 'pointer',
            fontFamily:'DM Sans,sans-serif', boxShadow: (!tplId || selected.size === 0) ? 'none' : '0 4px 16px rgba(79,70,229,.3)',
          }}>
          {sending ? `⏳ Sending… (${sentLog.length}/${selected.size})` : `🚀 Send to ${selected.size} Consultant${selected.size !== 1 ? 's' : ''}`}
        </button>

        {/* Sent log */}
        {showLog && sentLog.length > 0 && (
          <div style={{ marginTop:16, border:'1.5px solid var(--bd)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ background:'var(--bg)', padding:'8px 14px', fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.5px', borderBottom:'1px solid var(--bd)', display:'flex', justifyContent:'space-between' }}>
              <span>Send Results</span>
              <span style={{ color: sentLog.filter(l=>l.ok).length === sentLog.length ? '#10b981' : '#f59e0b' }}>
                {sentLog.filter(l=>l.ok).length}/{sentLog.length} ok
              </span>
            </div>
            <div style={{ maxHeight:200, overflowY:'auto' }}>
              {sentLog.map((l,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom: i<sentLog.length-1 ? '1px solid var(--bd)' : 'none', fontSize:12 }}>
                  <span>{l.ok ? '✅' : '❌'}</span>
                  <span style={{ fontWeight:700, flex:1 }}>{l.name}</span>
                  <span style={{ color:'var(--m)' }}>{l.to}</span>
                  {l.err && <span style={{ color:'#ef4444', fontSize:11 }}>{l.err}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: consultant selector */}
      <div>
        <div style={{ border:'1.5px solid var(--bd)', borderRadius:14, overflow:'hidden', background:'var(--card)' }}>
          <div style={{ padding:'12px 16px', background:'var(--bg)', borderBottom:'1.5px solid var(--bd)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontWeight:700, fontSize:13 }}>Select Recipients</div>
            <button onClick={toggleAll}
              style={{ fontSize:12, fontWeight:700, color:'var(--acc)', background:'none', border:'none', cursor:'pointer' }}>
              {selected.size === consultants.length ? 'Deselect All' : `Select All (${consultants.length})`}
            </button>
          </div>
          {consultants.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center', fontSize:13, color:'var(--m)' }}>No consultants yet</div>
          ) : (
            <div style={{ maxHeight:480, overflowY:'auto' }}>
              {consultants.map(c => {
                const to = channel === 'email' ? c.email : (c.mobile_number || c.contact_number);
                const isSelected = selected.has(c.id);
                return (
                  <label key={c.id}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', cursor:'pointer',
                      borderBottom:'1px solid var(--bd)',
                      background: isSelected ? 'rgba(79,70,229,.05)' : 'transparent',
                      transition:'background .1s',
                    }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)}
                      style={{ width:16, height:16, accentColor:'var(--acc)', cursor:'pointer', flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{c.name || c.email}</div>
                      <div style={{ fontSize:11, color: to ? 'var(--m)' : '#ef4444' }}>
                        {to || `No ${channel} address`}
                      </div>
                    </div>
                    {c.consultant_code && (
                      <code style={{ fontSize:10, background:'rgba(79,70,229,.1)', color:'#4f46e5', padding:'2px 7px', borderRadius:10, fontWeight:700 }}>{c.consultant_code}</code>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <div style={{ padding:'10px 16px', background:'var(--bg)', borderTop:'1.5px solid var(--bd)', fontSize:12, color:'var(--m)', fontWeight:600 }}>
            {selected.size} of {consultants.length} selected
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS (unchanged from original ConsultantAnalytics)
// ═════════════════════════════════════════════════════════════════════════════
function ConsultantAnalytics({ consultants, enrichedRows, schools, colors }: {
  consultants: Row[]; enrichedRows: Row[]; schools: Row[]; colors: string[];
}) {
  const [selConsultant, setSelConsultant] = React.useState<string>('__all__');

  const baseRows = selConsultant === '__all__'
    ? enrichedRows
    : enrichedRows.filter(r => r.consultant_id === selConsultant);

  const paid    = baseRows.filter(r => r.payment_status === 'paid');
  const pending = baseRows.filter(r => ['pending','initiated'].includes(r.payment_status));
  const failed  = baseRows.filter(r => ['failed','cancelled'].includes(r.payment_status));
  const totalRev = paid.reduce((s,r) => s + (r.final_amount??0), 0);
  const conv = baseRows.length ? Math.round(paid.length / baseRows.length * 100) : 0;
  const avgTicket = paid.length ? Math.round(totalRev / paid.length) : 0;

  const leaderboard: Row[] = consultants.map((c): Row => {
    const cRows = enrichedRows.filter(r => r.consultant_id === c.id);
    const p     = cRows.filter(r => r.payment_status === 'paid');
    const rev   = p.reduce((s: number, r: Row) => s + (r.final_amount ?? 0), 0);
    const schoolCount = [...new Set(cRows.map(r => r.school_id).filter(Boolean))].length;
    return { ...c, rows: cRows.length, paid: p.length, rev, conv: cRows.length ? Math.round(p.length / cRows.length * 100) : 0, schoolCount } as Row;
  }).sort((a, b) => b.rev - a.rev);

  const mkBreakdown = (key: (r: Row) => string) => {
    const tot: Record<string,number> = {}, p: Record<string,number> = {};
    baseRows.forEach(r => { const k = key(r)||'Unknown'; tot[k]=(tot[k]??0)+1; if(r.payment_status==='paid') p[k]=(p[k]??0)+1; });
    return Object.keys(tot).sort((a,b)=>tot[b]-tot[a]).slice(0,8).map(k => ({ label:k, total:tot[k], paid:p[k]??0, conv: tot[k]>0?Math.round(((p[k]??0)/tot[k])*100):0 }));
  };
  const bySchool  = mkBreakdown(r => r.school_name ?? r.parent_school ?? '');
  const byCity    = mkBreakdown(r => r.city ?? '');
  const byProgram = mkBreakdown(r => r.program_name ?? '');
  const byClass   = mkBreakdown(r => r.class_grade ?? '');

  function BarRow({ label, total, paid: p, conv: c, color }: { label:string; total:number; paid:number; conv:number; color:string }) {
    const maxTotal = baseRows.length || 1;
    return (
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid var(--bd)'}}>
        <span style={{fontSize:12,color:'var(--text)',minWidth:120,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}} title={label}>{label}</span>
        <div style={{flex:1,height:10,background:'var(--bg)',borderRadius:5,overflow:'hidden',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,width:`${Math.round(total/maxTotal*100)}%`,height:'100%',background:`${color}25`,borderRadius:5}}/>
          <div style={{position:'absolute',left:0,top:0,width:`${Math.round(p/maxTotal*100)}%`,height:'100%',background:color,borderRadius:5}}/>
        </div>
        <span style={{fontSize:11,fontWeight:700,color:'var(--m)',minWidth:24,textAlign:'right'}}>{total}</span>
        <span style={{fontSize:11,color:'#10b981',fontWeight:800,minWidth:24,textAlign:'right'}}>{p}</span>
        <span style={{fontSize:10,color:c>=60?'#10b981':c>=30?'#f59e0b':'#ef4444',fontWeight:700,minWidth:36,textAlign:'right',background:c>=60?'#d1fae5':c>=30?'#fef3c7':'#fee2e2',padding:'1px 5px',borderRadius:4}}>{c}%</span>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {consultants.length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--m)'}}>Filter by Consultant:</span>
          {['__all__',...consultants.map(c=>c.id)].map((id,i) => {
            const c = consultants.find(x=>x.id===id);
            const label = id==='__all__' ? '🌐 All Consultants' : c?.name ?? id;
            const count = id==='__all__' ? enrichedRows.length : enrichedRows.filter(r=>r.consultant_id===id).length;
            return (
              <button key={id} onClick={()=>setSelConsultant(id)}
                style={{padding:'6px 14px',borderRadius:20,border:'1.5px solid',cursor:'pointer',fontSize:12,fontWeight:600,transition:'all .15s',fontFamily:'DM Sans,sans-serif',
                  background:selConsultant===id?colors[(i-1)%colors.length]??'var(--acc)':'transparent',
                  borderColor:selConsultant===id?colors[(i-1)%colors.length]??'var(--acc)':'var(--bd)',
                  color:selConsultant===id?'#fff':'var(--m)'}}>
                {label} <span style={{opacity:.7,fontSize:10}}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
        {[
          {label:'Total Registrations',val:baseRows.length,     sub:`${conv}% conv rate`,          color:'#4f46e5',bg:'#eef2ff',icon:'📋'},
          {label:'Paid',               val:paid.length,          sub:`₹${fmtR(totalRev)} collected`, color:'#10b981',bg:'#ecfdf5',icon:'✅'},
          {label:'Pending',            val:pending.length,       sub:'need follow-up',               color:'#f59e0b',bg:'#fffbeb',icon:'⏳'},
          {label:'Failed',             val:failed.length,        sub:'lost conversions',             color:'#ef4444',bg:'#fff1f2',icon:'❌'},
          {label:'Total Revenue',      val:`₹${fmtR(totalRev)}`, sub:'from paid registrations',      color:'#8b5cf6',bg:'#f5f3ff',icon:'💰'},
          {label:'Avg Ticket',         val:`₹${fmtR(avgTicket)}`,sub:'per paid student',             color:'#06b6d4',bg:'#ecfeff',icon:'🎫'},
        ].map(m=>(
          <div key={m.label} style={{background:m.bg,border:`1.5px solid ${m.color}30`,borderRadius:14,padding:'16px 14px 12px'}}>
            <div style={{fontSize:22,marginBottom:8}}>{m.icon}</div>
            <div style={{fontSize:26,fontWeight:900,color:m.color,fontFamily:'Sora,sans-serif',lineHeight:1,letterSpacing:'-0.5px'}}>{m.val}</div>
            <div style={{fontSize:12,fontWeight:700,color:m.color,marginTop:5,opacity:.9}}>{m.label}</div>
            <div style={{fontSize:10,color:'var(--m)',marginTop:2}}>{m.sub}</div>
          </div>
        ))}
      </div>

      {selConsultant==='__all__' && leaderboard.length > 0 && (
        <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:14}}>🏆 Consultant Leaderboard</div>
          {leaderboard.map((c,i)=>{
            const maxRev = leaderboard[0]?.rev || 1;
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<leaderboard.length-1?'1px solid var(--bd)':'none'}}>
                <span style={{fontSize:i<3?18:12,width:24,textAlign:'center',fontWeight:700,color:'#f59e0b',flexShrink:0}}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>{c.name}</div>
                  <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{c.email} · {c.schoolCount} schools</div>
                  <div style={{marginTop:5,height:5,background:'var(--bd)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${Math.round(c.rev/maxRev*100)}%`,height:'100%',background:colors[i%colors.length],borderRadius:3}}/>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:'#10b981',fontFamily:'Sora,sans-serif'}}>₹{fmtR(c.rev)}</div>
                  <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{c.paid} paid · {c.conv}% conv</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {[
          {title:'🏫 By School (Top 8)',data:bySchool},
          {title:'🗺️ By City (Top 8)', data:byCity},
          {title:'📚 By Program',       data:byProgram},
          {title:'🎓 By Class',         data:byClass},
        ].map(({title,data},ci)=>(
          <div key={title} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{title}</div>
            <div style={{fontSize:10,color:'var(--m2)',marginBottom:14,display:'flex',gap:16}}>
              <span>■ Total</span><span style={{color:'#10b981'}}>■ Paid</span><span>Conv%</span>
            </div>
            {data.length===0
              ? <div style={{color:'var(--m)',fontSize:12,padding:'8px 0'}}>No data</div>
              : data.map((d,i)=><BarRow key={d.label} {...d} color={colors[i%colors.length]}/>)
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED MINI COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════
function Kpi({ label, val, color = 'var(--text)' }: { label: string; val: string | number; color?: string }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:18, fontWeight:900, color, fontFamily:'Sora,sans-serif', lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:10, color:'var(--m)', marginTop:2, fontWeight:600 }}>{label}</div>
    </div>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily: mono ? 'monospace' : 'DM Sans,sans-serif' }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--m)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>{icon}</div>
      <div style={{ fontWeight:700, fontSize:15, marginBottom:8, color:'var(--text)' }}>{title}</div>
      <div style={{ fontSize:13 }}>{sub}</div>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div style={{ textAlign:'center', padding:'48px', color:'var(--m)', fontSize:14 }}>
      ⏳ {text}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onClose }: {
  title:        string;
  message:      React.ReactNode;
  confirmLabel: string;
  confirmColor: string;
  onConfirm:    () => void;
  onClose:      () => void;
}) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:18, padding:'28px 28px 22px', maxWidth:480, width:'100%', boxShadow:'0 24px 48px rgba(0,0,0,.25)' }}>
        <h3 style={{ margin:'0 0 16px', fontSize:18, fontWeight:800, fontFamily:'Sora,sans-serif' }}>{title}</h3>
        <div style={{ fontSize:14, color:'var(--text)', marginBottom:24, lineHeight:1.6 }}>{message}</div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:10, border:'1.5px solid var(--bd)', background:'transparent', fontSize:13, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'9px 20px', borderRadius:10, border:'none', background:confirmColor, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ reg, onReject, onClose }: {
  reg:      Row;
  onReject: (reason: string) => void;
  onClose:  () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:18, padding:'28px', maxWidth:460, width:'100%' }}>
        <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:800, fontFamily:'Sora,sans-serif' }}>✕ Reject Registration</h3>
        <p style={{ fontSize:13, color:'var(--m)', marginBottom:18 }}>Rejecting <strong>{reg.full_name}</strong> ({reg.contact_email})</p>
        <div style={{ marginBottom:18 }}>
          <label style={LB}>Rejection Reason (optional)</label>
          <textarea style={{ ...IS, minHeight:90, lineHeight:1.6 }} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="E.g. Profile does not meet our current requirements…" />
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:10, border:'1.5px solid var(--bd)', background:'transparent', fontSize:13, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
          <button onClick={() => onReject(reason)} style={{ padding:'9px 20px', borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>✕ Reject</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DOWNLOAD REPORT BUTTON
// ═════════════════════════════════════════════════════════════════════════════
function DownloadReportBtn({ authHeaders, showToast }: {
  authHeaders: () => HeadersInit;
  showToast:   (m: string, i?: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    showToast('Generating report…', '⏳');
    try {
      const res = await authFetch(`${BACKEND}/api/admin/consultant-registrations/report`, {
        headers: authHeaders() as any,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error ?? 'Report generation failed', '❌');
        return;
      }
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `Thynk_Consultant_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Report downloaded!', '✅');
    } catch (e: any) {
      showToast(e.message ?? 'Download failed', '❌');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={download} disabled={loading}
      style={{
        padding:'8px 14px', borderRadius:9,
        background: loading ? '#e5e7eb' : '#10b981',
        border:'none', color:'#fff', fontSize:12, fontWeight:700,
        cursor: loading ? 'not-allowed' : 'pointer',
        display:'flex', alignItems:'center', gap:6, transition:'background .15s',
      }}>
      {loading ? '⏳ Generating…' : '📥 Download Report'}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION LINKS MODAL
// ═════════════════════════════════════════════════════════════════════════════
function RegistrationLinksModal({ consultant, programs, BACKEND: _BURL, onClose, showToast }: {
  consultant: Row; programs: Row[]; BACKEND?: string; onClose: () => void; showToast: (m: string, i?: string) => void;
}) {
  const baseUrl = 'https://thynksuccess.com';
  const code    = consultant.consultant_code as string | null;
  const active  = programs.filter(p => p.status === 'active');
  const rows    = active.map(p => ({
    name:    p.name as string, slug: p.slug as string,
    generic: `${baseUrl}/registration/${p.slug}/`,
    curated: code ? `${baseUrl}/registration/${p.slug}/?consultant=${code}` : null,
  }));
  const copy = (url: string, label: string) => { navigator.clipboard.writeText(url); showToast(`${label} copied!`, '📋'); };
  const LS: React.CSSProperties = { fontFamily:'monospace', fontSize:11, color:'var(--text)', background:'var(--bg)', padding:'5px 10px', borderRadius:6, wordBreak:'break-all', flex:1 };
  const CB: React.CSSProperties = { flexShrink:0, padding:'5px 11px', borderRadius:7, border:'1.5px solid rgba(79,70,229,.3)', background:'rgba(79,70,229,.06)', color:'#4f46e5', fontSize:11, fontWeight:700, cursor:'pointer' };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:20, width:'100%', maxWidth:620, padding:'28px', maxHeight:'88vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <h2 style={{ margin:0, fontSize:17, fontWeight:800, fontFamily:'Sora,sans-serif' }}>🔗 Registration Links</h2>
            <div style={{ fontSize:12, color:'var(--m)', marginTop:3 }}>
              {consultant.name || consultant.email}
              {code && <> · Code: <code style={{ fontSize:11, background:'var(--bg)', padding:'1px 6px', borderRadius:4, color:'#4f46e5', fontWeight:700 }}>{code}</code></>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--m)' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:12 }}>
          {active.length === 0
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--m)', fontSize:13 }}>No active programs found.</div>
            : rows.map(row => (
              <div key={row.slug} style={{ border:'1.5px solid var(--bd)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ background:'var(--bg)', padding:'7px 14px', borderBottom:'1px solid var(--bd)', fontSize:13, fontWeight:700 }}>🎯 {row.name}</div>
                <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                  {row.curated && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#4f46e5', minWidth:62, background:'rgba(79,70,229,.1)', padding:'2px 7px', borderRadius:10, textAlign:'center' }}>Curated</span>
                      <span style={LS}>{row.curated}</span>
                      <button style={CB} onClick={() => copy(row.curated!, row.name)}>📋</button>
                    </div>
                  )}
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--m)', minWidth:62, background:'var(--bg)', padding:'2px 7px', borderRadius:10, textAlign:'center', border:'1px solid var(--bd)' }}>Generic</span>
                    <span style={LS}>{row.generic}</span>
                    <button style={{ ...CB, color:'var(--m)', borderColor:'var(--bd)', background:'var(--bg)' }} onClick={() => copy(row.generic, row.name)}>📋</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', paddingTop:14, borderTop:'1px solid var(--bd)' }}>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
