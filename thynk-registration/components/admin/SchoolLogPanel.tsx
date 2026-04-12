'use client';
/**
 * SchoolLogPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this panel INSIDE the school row / school detail area on the Schools page.
 *
 * USAGE — in SchoolsPageWithApproval.tsx or wherever a school row is expanded:
 *
 *   import { SchoolLogPanel } from '@/components/admin/SchoolLogPanel';
 *
 *   // In your school row expansion / drawer:
 *   <SchoolLogPanel
 *     schoolId={school.id}
 *     schoolCode={school.school_code}
 *     authHeaders={authHeaders}
 *     BACKEND={BACKEND}
 *   />
 *
 * DATA SOURCES (all existing API routes — no new endpoints needed):
 *   /api/admin/activity-logs?schoolId=<id>          → School lifecycle events
 *   /api/admin/registrations?schoolCode=<code>      → All registrations for school
 *   /api/admin/notification-logs?schoolId=<id>       → Email + WA logs
 *     (add this thin GET route — see bottom of file for the 10-line route)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';

type Row = Record<string, any>;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const fmtAmt = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  paid:      { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  sent:      { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  failed:    { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
  pending:   { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
  initiated: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#9ca3af' },
  approved:  { bg: 'rgba(56,189,248,0.12)', color: '#38bdf8' },
  rejected:  { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
};

function StatusBadge({ val }: { val: string }) {
  const s = STATUS_BADGE[val] ?? { bg: 'rgba(255,255,255,0.06)', color: '#9ca3af' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{val}</span>
  );
}

function Spinner() {
  return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--m)' }}>
      <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', fontSize: 22 }}>⟳</span>
      <div style={{ fontSize: 12, marginTop: 8, color: 'var(--m2)' }}>Loading…</div>
    </div>
  );
}

function Empty({ msg = 'No records found' }: { msg?: string }) {
  return (
    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--m2)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>◌</div>
      {msg}
    </div>
  );
}

// ── Sub-tab: Activity Log ────────────────────────────────────────────────────
const ACTION_ICON: Record<string, string> = {
  'school.approved':    '✓', 'school.rejected':  '✗', 'school.created':     '＋',
  'school.registered':  '◎', 'pricing.updated':  '＄', 'discount.created':   '⊕',
  'user.created':       '◈', 'integration.updated': '⚙', 'school.updated': '✎',
};
const ACTION_COLOR: Record<string, string> = {
  'school.approved': '#22c55e', 'school.rejected':  '#ef4444', 'school.created':     '#38bdf8',
  'school.registered': '#fb923c', 'pricing.updated': '#eab308', 'discount.created':  '#a78bfa',
  'user.created': '#34d399',     'integration.updated': '#60a5fa', 'school.updated': '#f9a8d4',
};

function ActivityLog({ rows, loading }: { rows: Row[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <Empty msg="No activity recorded for this school yet." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
      {rows.map(r => (
        <div key={r.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '10px 14px', background: 'var(--card)', borderRadius: 10,
          border: '1px solid var(--bd)',
        }}>
          {/* Icon circle */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: (ACTION_COLOR[r.action] ?? '#6b7280') + '1a',
            color: ACTION_COLOR[r.action] ?? '#6b7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, marginTop: 1,
          }}>
            {ACTION_ICON[r.action] ?? '•'}
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>
                {r.user_email ?? 'system'}
              </span>
              <span style={{
                color: ACTION_COLOR[r.action] ?? 'var(--m)', fontWeight: 600,
                fontSize: 12, background: (ACTION_COLOR[r.action] ?? '#6b7280') + '15',
                padding: '1px 8px', borderRadius: 6,
              }}>{r.action}</span>
            </div>
            {/* Metadata pills */}
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {Object.entries(r.metadata).map(([k, v]) => (
                  <span key={k} style={{
                    fontSize: 11, color: 'var(--m)', background: 'rgba(255,255,255,0.04)',
                    padding: '2px 8px', borderRadius: 5, border: '1px solid var(--bd)',
                  }}>
                    <span style={{ color: 'var(--m2)' }}>{k}:</span>{' '}
                    <span style={{ color: 'var(--text)' }}>{String(v)}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--m2)', marginTop: 4 }}>
              {fmt(r.created_at)} · <span style={{ color: 'var(--m)' }}>{ago(r.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sub-tab: Registrations ───────────────────────────────────────────────────
function RegistrationsLog({ rows, loading }: { rows: Row[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <Empty msg="No registrations yet for this school." />;

  const stats = {
    total:  rows.length,
    paid:   rows.filter(r => r.payment_status === 'paid').length,
    pending: rows.filter(r => ['pending','initiated'].includes(r.payment_status)).length,
    failed: rows.filter(r => ['failed','cancelled'].includes(r.payment_status)).length,
    rev:    rows.filter(r => r.payment_status === 'paid').reduce((a, r) => a + (r.final_amount ?? 0), 0),
  };

  return (
    <div>
      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { l: 'Total',    v: stats.total,          c: 'var(--m)'   },
          { l: 'Paid',     v: stats.paid,            c: '#22c55e'    },
          { l: 'Pending',  v: stats.pending,         c: '#eab308'    },
          { l: 'Failed',   v: stats.failed,          c: '#ef4444'    },
          { l: 'Revenue',  v: fmtAmt(stats.rev),     c: '#38bdf8'    },
        ].map(s => (
          <div key={s.l} style={{
            background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 10,
            padding: '8px 14px', minWidth: 70,
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.c, fontFamily: 'Sora, sans-serif' }}>{s.v}</div>
            <div style={{ fontSize: 10, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--bd)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Date', 'Student', 'Class', 'City', 'Gateway', 'Discount', 'Amount', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '9px 13px', textAlign: 'left', fontSize: 10,
                  fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--m2)', borderBottom: '1px solid var(--bd)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--bd)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '9px 13px', fontSize: 11, color: 'var(--m)', whiteSpace: 'nowrap' }}>
                  <div>{r.created_at?.slice(0, 10)}</div>
                  <div style={{ fontSize: 10, color: 'var(--m2)' }}>{ago(r.created_at)}</div>
                </td>
                <td style={{ padding: '9px 13px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.student_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--m)' }}>{r.parent_name}</div>
                </td>
                <td style={{ padding: '9px 13px', fontSize: 12, color: 'var(--m)' }}>{r.class_grade}</td>
                <td style={{ padding: '9px 13px', fontSize: 12, color: 'var(--m)' }}>{r.city}</td>
                <td style={{ padding: '9px 13px', fontSize: 11, color: 'var(--m2)' }}>{r.gateway ?? '—'}</td>
                <td style={{ padding: '9px 13px', fontSize: 11, color: '#fb923c' }}>
                  {r.discount_code ? `${r.discount_code}` : '—'}
                </td>
                <td style={{ padding: '9px 13px', fontSize: 13, fontWeight: 700, color: '#22c55e', whiteSpace: 'nowrap' }}>
                  {r.final_amount ? fmtAmt(r.final_amount) : '—'}
                </td>
                <td style={{ padding: '9px 13px' }}>
                  <StatusBadge val={r.payment_status ?? 'pending'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-tab: Notification Logs (Email or WhatsApp) ────────────────────────────
function NotifLog({
  rows, loading, channel,
}: { rows: Row[]; loading: boolean; channel: 'email' | 'whatsapp' }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <Empty msg={`No ${channel} notifications sent for this school yet.`} />;

  const stats = {
    sent:    rows.filter(r => r.status === 'sent').length,
    failed:  rows.filter(r => r.status === 'failed').length,
    pending: rows.filter(r => r.status === 'pending').length,
  };

  const EVENT_COLOR: Record<string, string> = {
    payment_success:      '#22c55e',
    payment_failed:       '#ef4444',
    registration_created: '#38bdf8',
  };

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { l: 'Sent',    v: stats.sent,    c: '#22c55e' },
          { l: 'Failed',  v: stats.failed,  c: '#ef4444' },
          { l: 'Pending', v: stats.pending, c: '#eab308' },
        ].map(s => (
          <div key={s.l} style={{
            background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 10,
            padding: '8px 14px', minWidth: 70,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: 'Sora, sans-serif' }}>{s.v}</div>
            <div style={{ fontSize: 10, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--bd)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Date', 'Recipient', 'Event', 'Template', 'Provider', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '9px 13px', textAlign: 'left', fontSize: 10,
                  fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--m2)', borderBottom: '1px solid var(--bd)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--bd)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '9px 13px', fontSize: 11, color: 'var(--m)', whiteSpace: 'nowrap' }}>
                  <div>{r.created_at?.slice(0, 10)}</div>
                  <div style={{ fontSize: 10, color: 'var(--m2)' }}>{ago(r.created_at)}</div>
                </td>
                <td style={{ padding: '9px 13px', fontSize: 12, color: 'var(--m)', fontFamily: 'monospace' }}>
                  {r.recipient}
                </td>
                <td style={{ padding: '9px 13px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: EVENT_COLOR[r.event_type ?? ''] ?? 'var(--m)',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{(r.event_type ?? '—').replace(/_/g, ' ')}</span>
                </td>
                <td style={{ padding: '9px 13px', fontSize: 11, color: 'var(--m2)' }}>
                  {r.notification_templates?.name ?? r.trigger_name ?? '—'}
                </td>
                <td style={{ padding: '9px 13px' }}>
                  <span style={{
                    fontSize: 11, color: '#a78bfa', fontFamily: 'monospace',
                    background: 'rgba(167,139,250,0.1)', padding: '2px 7px', borderRadius: 5,
                  }}>{r.provider}</span>
                </td>
                <td style={{ padding: '9px 13px' }}><StatusBadge val={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',      label: 'Activity Log',    icon: '◈' },
  { id: 'registrations', label: 'Registrations',   icon: '📋' },
  { id: 'emails',        label: 'Email Log',        icon: '✉' },
  { id: 'whatsapp',      label: 'WhatsApp Log',     icon: '💬' },
] as const;

type TabId = typeof TABS[number]['id'];

export function SchoolLogPanel({
  schoolId,
  schoolCode,
  authHeaders,
  BACKEND = '',
}: {
  schoolId:    string;
  schoolCode:  string;
  authHeaders: () => HeadersInit;
  BACKEND?:    string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('activity');

  const [activityRows,      setActivityRows]      = useState<Row[]>([]);
  const [registrationRows,  setRegistrationRows]  = useState<Row[]>([]);
  const [emailRows,         setEmailRows]         = useState<Row[]>([]);
  const [waRows,            setWaRows]            = useState<Row[]>([]);

  const [loadingActivity,      setLoadingActivity]      = useState(false);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [loadingEmails,        setLoadingEmails]        = useState(false);
  const [loadingWa,            setLoadingWa]            = useState(false);

  const api = useCallback(async (path: string) => {
    const res = await fetch(`${BACKEND}${path}`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [BACKEND, authHeaders]);

  // Load data per tab, lazily
  useEffect(() => {
    if (activeTab === 'activity' && !activityRows.length) {
      setLoadingActivity(true);
      api(`/api/admin/activity-logs?schoolId=${schoolId}&limit=100`)
        .then(d => setActivityRows(d.logs ?? []))
        .catch(console.error)
        .finally(() => setLoadingActivity(false));
    }

    if (activeTab === 'registrations' && !registrationRows.length) {
      setLoadingRegistrations(true);
      api(`/api/admin/registrations?schoolCode=${schoolCode}&limit=500`)
        .then(d => setRegistrationRows(d.rows ?? []))
        .catch(console.error)
        .finally(() => setLoadingRegistrations(false));
    }

    if (activeTab === 'emails' && !emailRows.length) {
      setLoadingEmails(true);
      api(`/api/admin/notification-logs?schoolId=${schoolId}&channel=email`)
        .then(d => setEmailRows(d.logs ?? []))
        .catch(console.error)
        .finally(() => setLoadingEmails(false));
    }

    if (activeTab === 'whatsapp' && !waRows.length) {
      setLoadingWa(true);
      api(`/api/admin/notification-logs?schoolId=${schoolId}&channel=whatsapp`)
        .then(d => setWaRows(d.logs ?? []))
        .catch(console.error)
        .finally(() => setLoadingWa(false));
    }
  }, [activeTab, schoolId, schoolCode]);

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--bd)',
      borderRadius: 14,
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.2)',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--bd)',
        background: 'rgba(255,255,255,0.02)', overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 18px', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em', fontFamily: 'inherit',
            color: activeTab === t.id ? 'var(--text)' : 'var(--m)',
            borderBottom: `2px solid ${activeTab === t.id ? 'var(--acc)' : 'transparent'}`,
            transition: 'all 0.12s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {activeTab === 'activity'      && <ActivityLog      rows={activityRows}     loading={loadingActivity}      />}
        {activeTab === 'registrations' && <RegistrationsLog rows={registrationRows} loading={loadingRegistrations} />}
        {activeTab === 'emails'        && <NotifLog rows={emailRows} loading={loadingEmails} channel="email"     />}
        {activeTab === 'whatsapp'      && <NotifLog rows={waRows}    loading={loadingWa}     channel="whatsapp" />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
