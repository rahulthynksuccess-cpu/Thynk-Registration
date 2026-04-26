'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  info:     { icon: 'ℹ️',  color: '#3b82f6', label: 'Info'     },
  success:  { icon: '✅',  color: '#10b981', label: 'Success'  },
  warning:  { icon: '⚠️',  color: '#f59e0b', label: 'Warning'  },
  alert:    { icon: '🚨',  color: '#ef4444', label: 'Alert'    },
  document: { icon: '📎',  color: '#8b5cf6', label: 'Document' },
};

const AUDIENCE_LABELS: Record<string, string> = {
  admin:  '🔒 Admin Only',
  school: '🏫 School Portal',
  both:   '🌐 Both',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Notification {
  id: string;
  school_id: string | null;
  audience: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  schools?: { name: string };
}
interface School { id: string; name: string; school_code: string; }

// ── Bell Icon with Badge ──────────────────────────────────────────────────────
export function NotificationBell({ onClick }: { onClick: () => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetch = () => {
      authFetch(`${BACKEND}/api/admin/notifications?audience=admin&unread=true&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setUnread(d?.unread_count ?? 0))
        .catch(() => {});
    };
    fetch();
    const iv = setInterval(fetch, 30000); // poll every 30 s
    return () => clearInterval(iv);
  }, []);

  return (
    <button
      onClick={onClick}
      style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8, color: 'var(--text-primary)', fontSize: 20 }}
    >
      🔔
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16,
          background: '#ef4444', color: '#fff', borderRadius: 10,
          fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 3px',
        }}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

// ── Notification Dropdown ─────────────────────────────────────────────────────
export function NotificationDropdown({ onClose, onViewAll }: { onClose: () => void; onViewAll: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    authFetch(`${BACKEND}/api/admin/notifications?audience=admin&limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setNotifications(d?.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const markAllRead = async () => {
    await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    load();
  };

  const markRead = async (id: string) => {
    await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 1000,
      width: 380, maxHeight: 520, overflowY: 'auto',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🔔 Notifications {unreadCount > 0 && `(${unreadCount})`}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Mark all read
            </button>
          )}
          <button onClick={onViewAll} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            View all
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No notifications yet</div>
      ) : (
        notifications.map(n => {
          const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
          return (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              style={{
                display: 'flex', gap: 12, padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.04)',
                cursor: n.is_read ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{cfg.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, lineHeight: 1.3 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(n.created_at)}</span>
                  <span style={{ fontSize: 10, background: 'var(--border)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>
                    {AUDIENCE_LABELS[n.audience]}
                  </span>
                </div>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 4 }} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Full Notification Control Panel ──────────────────────────────────────────
export function NotificationControlPanel({ showToast }: { showToast: (m: string, i?: string) => void }) {
  const [schools,       setSchools]       = useState<School[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [filterAud,     setFilterAud]     = useState('all');
  const [filterType,    setFilterType]    = useState('all');

  // Compose form
  const [composeOpen,   setComposeOpen]   = useState(false);
  const [form, setForm] = useState({
    school_id: '', audience: 'school', type: 'info', title: '', message: '',
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/schools/list`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSchools(d?.schools ?? []))
      .catch(() => {});
  }, []);

  const loadNotifications = useCallback(() => {
    setLoading(true);
    authFetch(`${BACKEND}/api/admin/notifications?audience=admin&limit=100`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setNotifications(d?.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showToast('Title and message are required', '⚠️'); return;
    }
    setSending(true);
    const body: any = { audience: form.audience, type: form.type, title: form.title, message: form.message };
    if (form.school_id) body.school_id = form.school_id;

    const res = await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSending(false);
    if (res.ok) {
      showToast('Notification sent!', '✅');
      setForm({ school_id: '', audience: 'school', type: 'info', title: '', message: '' });
      setComposeOpen(false);
      loadNotifications();
    } else {
      const d = await res.json();
      showToast(d.error ?? 'Failed to send', '❌');
    }
  };

  const markAllRead = async () => {
    await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    loadNotifications();
  };

  const filtered = notifications.filter(n => {
    if (filterAud  !== 'all' && n.audience !== filterAud) return false;
    if (filterType !== 'all' && n.type     !== filterType) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🔔 Notification Control Panel</h3>
          {unreadCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {unreadCount} unread ·{' '}
              <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={markAllRead}>Mark all read</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setComposeOpen(v => !v)}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          ✉️ Send Notification
        </button>
      </div>

      {/* Compose Panel */}
      {composeOpen && (
        <div className="card" style={{ padding: 20, border: '1px solid var(--accent)', borderRadius: 12 }}>
          <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Compose Notification</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target School (blank = all)</label>
              <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
                <option value="">Broadcast to all</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Audience</label>
              <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
                {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
          </div>
          <input
            type="text" placeholder="Notification title *" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
          />
          <textarea
            placeholder="Message body *" value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 12, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSend} disabled={sending}
              style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {sending ? '⏳ Sending…' : '📤 Send'}
            </button>
            <button onClick={() => setComposeOpen(false)}
              style={{ padding: '9px 22px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10 }}>
        <select value={filterAud} onChange={e => setFilterAud(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="all">All Audiences</option>
          {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Notification list */}
      <div className="card" style={{ padding: 4 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No notifications found.</div>
        ) : (
          filtered.map(n => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
            return (
              <div key={n.id} style={{
                display: 'flex', gap: 14, padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.04)',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700 }}>{n.title}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: cfg.color + '22', color: cfg.color, fontWeight: 600 }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--border)', color: 'var(--text-muted)' }}>
                      {AUDIENCE_LABELS[n.audience]}
                    </span>
                    {!n.is_read && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#3b82f622', color: '#3b82f6', fontWeight: 600 }}>
                        Unread
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {timeAgo(n.created_at)}
                    {n.entity_type && ` · ${n.entity_type}`}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
