'use client';
/**
 * StudentLogPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this inside the student detail modal in admin/page.tsx.
 *
 * USAGE — replace (or extend) the modal-body in admin/page.tsx:
 *
 *   import { StudentLogPanel } from '@/components/admin/StudentLogPanel';
 *
 *   {modal && (
 *     <div className="modal-overlay show" ...>
 *       <div className="modal modal-wide">   {// add modal-wide class for more width}
 *         <div className="modal-head">...</div>
 *         <div className="modal-body">
 *           ... existing fields rows ...
 *         </div>
 *         {// ← Add this below the existing modal-body:}
 *         <StudentLogPanel
 *           registrationId={modal.id}
 *           studentEmail={modal.contact_email}
 *           studentPhone={modal.contact_phone}
 *           authHeaders={authHeaders}
 *           BACKEND={BACKEND}
 *         />
 *         <div className="modal-actions">...</div>
 *       </div>
 *     </div>
 *   )}
 *
 * DATA SOURCES:
 *   /api/admin/notification-logs?registrationId=<id>&channel=email     → Email log
 *   /api/admin/notification-logs?registrationId=<id>&channel=whatsapp  → WA log
 *   (Same route as SchoolLogPanel — just different query params)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';

type Row = Record<string, any>;

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS_CLR: Record<string, { bg: string; fg: string }> = {
  sent:    { bg: 'rgba(34,197,94,0.12)',  fg: '#22c55e' },
  failed:  { bg: 'rgba(239,68,68,0.12)',  fg: '#ef4444' },
  pending: { bg: 'rgba(234,179,8,0.12)',  fg: '#eab308' },
};

function StatusBadge({ val }: { val: string }) {
  const s = STATUS_CLR[val] ?? { bg: 'rgba(255,255,255,0.06)', fg: '#9ca3af' };
  return (
    <span style={{
      background: s.bg, color: s.fg,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{val}</span>
  );
}

const EVENT_CLR: Record<string, string> = {
  payment_success:      '#22c55e',
  payment_failed:       '#ef4444',
  registration_created: '#38bdf8',
};

function NotifRows({ rows, loading, channel }: { rows: Row[]; loading: boolean; channel: 'email' | 'whatsapp' }) {
  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--m)' }}>
        <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', fontSize: 20 }}>⟳</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center', color: 'var(--m2)',
        fontSize: 12, fontStyle: 'italic',
      }}>
        No {channel === 'email' ? 'email' : 'WhatsApp'} notifications sent to this student yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => (
        <div key={r.id} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '11px 13px',
          background: r.status === 'sent'
            ? 'rgba(34,197,94,0.04)'
            : r.status === 'failed'
              ? 'rgba(239,68,68,0.04)'
              : 'rgba(234,179,8,0.04)',
          border: `1px solid ${
            r.status === 'sent' ? 'rgba(34,197,94,0.15)'
            : r.status === 'failed' ? 'rgba(239,68,68,0.15)'
            : 'rgba(234,179,8,0.15)'
          }`,
          borderRadius: 9,
        }}>
          {/* Status dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
            background: STATUS_CLR[r.status]?.fg ?? '#6b7280',
            boxShadow: r.status === 'sent' ? '0 0 6px #22c55e88' : undefined,
          }} />
          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Event label */}
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: EVENT_CLR[r.event_type ?? ''] ?? 'var(--m)',
              }}>
                {(r.event_type ?? '—').replace(/_/g, ' ')}
              </span>
              {/* Provider pill */}
              <span style={{
                fontSize: 10, color: '#a78bfa', fontFamily: 'monospace',
                background: 'rgba(167,139,250,0.1)',
                padding: '1px 7px', borderRadius: 5,
              }}>{r.provider}</span>
              {/* Status */}
              <StatusBadge val={r.status} />
            </div>
            {/* Template name */}
            {(r.notification_templates?.name || r.trigger_name) && (
              <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3 }}>
                📄 {r.notification_templates?.name ?? r.trigger_name}
              </div>
            )}
            {/* Recipient */}
            <div style={{ fontSize: 11, color: 'var(--m2)', marginTop: 2, fontFamily: 'monospace' }}>
              → {r.recipient}
            </div>
            {/* Time */}
            <div style={{ fontSize: 10, color: 'var(--m2)', marginTop: 4 }}>
              {fmt(r.sent_at ?? r.created_at)}
              {r.sent_at && (
                <span style={{ marginLeft: 6, color: 'var(--m)' }}>{ago(r.sent_at)}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function StudentLogPanel({
  registrationId,
  studentEmail,
  studentPhone,
  authHeaders,
  BACKEND = '',
}: {
  registrationId: string;
  studentEmail:   string;
  studentPhone:   string;
  authHeaders:    () => HeadersInit;
  BACKEND?:       string;
}) {
  const [tab, setTab] = useState<'email' | 'whatsapp'>('email');

  const [emailRows, setEmailRows] = useState<Row[]>([]);
  const [waRows,    setWaRows]    = useState<Row[]>([]);

  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingWa,    setLoadingWa]    = useState(false);

  const [emailLoaded, setEmailLoaded] = useState(false);
  const [waLoaded,    setWaLoaded]    = useState(false);

  const api = useCallback(async (path: string) => {
    const res = await fetch(`${BACKEND}${path}`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [BACKEND, authHeaders]);

  useEffect(() => {
    if (tab === 'email' && !emailLoaded) {
      setLoadingEmail(true);
      api(`/api/admin/notification-logs?registrationId=${registrationId}&channel=email`)
        .then(d => { setEmailRows(d.logs ?? []); setEmailLoaded(true); })
        .catch(console.error)
        .finally(() => setLoadingEmail(false));
    }
    if (tab === 'whatsapp' && !waLoaded) {
      setLoadingWa(true);
      api(`/api/admin/notification-logs?registrationId=${registrationId}&channel=whatsapp`)
        .then(d => { setWaRows(d.logs ?? []); setWaLoaded(true); })
        .catch(console.error)
        .finally(() => setLoadingWa(false));
    }
  }, [tab, registrationId, emailLoaded, waLoaded]);

  const emailSent   = emailRows.filter(r => r.status === 'sent').length;
  const emailFailed = emailRows.filter(r => r.status === 'failed').length;
  const waSent      = waRows.filter(r => r.status === 'sent').length;
  const waFailed    = waRows.filter(r => r.status === 'failed').length;

  return (
    <div style={{
      margin: '0 0 16px 0',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--bd)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Notification History
        </span>
        <span style={{ fontSize: 11, color: 'var(--m2)' }}>
          — what was sent to this student
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', background: 'rgba(255,255,255,0.01)' }}>
        {([
          { id: 'email',    label: 'Email',    icon: '✉',  sent: emailSent, failed: emailFailed },
          { id: 'whatsapp', label: 'WhatsApp', icon: '💬', sent: waSent,    failed: waFailed    },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            padding: '9px 16px', fontSize: 12, fontWeight: 600,
            color: tab === t.id ? 'var(--text)' : 'var(--m)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--acc)' : 'transparent'}`,
            transition: 'all 0.12s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{t.icon}</span>
            {t.label}
            {/* Sent count badge */}
            {t.sent > 0 && (
              <span style={{
                background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10,
              }}>{t.sent}✓</span>
            )}
            {/* Failed count badge */}
            {t.failed > 0 && (
              <span style={{
                background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10,
              }}>{t.failed}✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '14px' }}>
        {tab === 'email'    && <NotifRows rows={emailRows} loading={loadingEmail} channel="email"    />}
        {tab === 'whatsapp' && <NotifRows rows={waRows}    loading={loadingWa}    channel="whatsapp" />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
