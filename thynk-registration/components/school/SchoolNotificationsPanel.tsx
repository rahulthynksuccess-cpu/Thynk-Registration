'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  info:     { icon: 'ℹ️', color: '#3b82f6' },
  success:  { icon: '✅', color: '#10b981' },
  warning:  { icon: '⚠️', color: '#f59e0b' },
  alert:    { icon: '🚨', color: '#ef4444' },
  document: { icon: '📎', color: '#8b5cf6' },
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
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  audience: string;
}

// ── Notification Bell for School Dashboard header ─────────────────────────────
export function SchoolNotificationBell({
  onOpenNotifications,
}: {
  onOpenNotifications: () => void;
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetch = () => {
      authFetch(`${BACKEND}/api/school/notifications?limit=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setUnread(d?.unread_count ?? 0))
        .catch(() => {});
    };
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <button
      onClick={onOpenNotifications}
      style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8, fontSize: 20 }}
    >
      🔔
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
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

// ── Full school notification feed (for a dedicated tab or slide-over) ─────────
export function SchoolNotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterType,    setFilterType]    = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    authFetch(`${BACKEND}/api/school/notifications?limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setNotifications(d?.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    await authFetch(`${BACKEND}/api/school/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    load();
  };

  const markRead = async (id: string) => {
    await authFetch(`${BACKEND}/api/school/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const filtered = notifications.filter(n => filterType === 'all' || n.type === filterType);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🔔 Notifications</h3>
          {unreadCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {unreadCount} unread ·{' '}
              <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={markAllRead}>Mark all read</span>
            </div>
          )}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div>Loading notifications…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔕</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No notifications</div>
          <div style={{ fontSize: 13 }}>You're all caught up!</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((n, idx) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  display: 'flex', gap: 14, padding: '16px 18px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.05)',
                  cursor: n.is_read ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {/* Left accent bar */}
                <div style={{ width: 3, borderRadius: 2, background: n.is_read ? 'var(--border)' : cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 26, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, lineHeight: 1.3 }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {timeAgo(n.created_at)}
                    {n.entity_type && ` · ${n.entity_type}`}
                  </div>
                </div>
                {!n.is_read && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 6 }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
