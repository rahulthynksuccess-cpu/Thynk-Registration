'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  info:     { icon: 'ℹ️',  color: '#3b82f6', bg: '#eff6ff', label: 'Info'     },
  success:  { icon: '✅',  color: '#10b981', bg: '#ecfdf5', label: 'Success'  },
  warning:  { icon: '⚠️',  color: '#f59e0b', bg: '#fffbeb', label: 'Warning'  },
  alert:    { icon: '🚨',  color: '#ef4444', bg: '#fff1f2', label: 'Alert'    },
  document: { icon: '📎',  color: '#8b5cf6', bg: '#f5f3ff', label: 'Document' },
};

const AUDIENCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  admin:  { label: 'Admin Only',    color: '#6366f1', bg: '#eef2ff' },
  school: { label: 'School Portal', color: '#10b981', bg: '#ecfdf5' },
  both:   { label: 'Everyone',      color: '#f59e0b', bg: '#fffbeb' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface School { id: string; name: string; school_code: string; }
interface Notification {
  id: string; school_id: string | null; audience: string; type: string;
  title: string; message: string; entity_type: string | null;
  is_read: boolean; created_at: string;
}

// ── Bell Icon ─────────────────────────────────────────────────────────────────
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
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <button onClick={onClick} style={{
      position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
      padding: 8, borderRadius: 10, color: 'var(--text)', fontSize: 20,
      transition: 'background 0.15s',
    }}>
      🔔
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17,
          background: '#ef4444', color: '#fff', borderRadius: 10,
          fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '0 4px', boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
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
    authFetch(`${BACKEND}/api/admin/notifications?audience=admin&limit=15`)
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    load();
  };

  const markRead = async (id: string) => {
    await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
      width: 360, maxHeight: 480, overflowY: 'auto',
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
      boxShadow: '0 12px 40px rgba(0,0,0,0.15)', fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
          🔔 Notifications {unread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, fontSize: 10, padding: '1px 7px', marginLeft: 4 }}>{unread}</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {unread > 0 && <button onClick={markAllRead} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Mark all read</button>}
          <button onClick={onViewAll} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>View all →</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
          <div style={{ fontSize: 13 }}>No notifications yet</div>
        </div>
      ) : notifications.map(n => {
        const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
        return (
          <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
            display: 'flex', gap: 12, padding: '12px 16px',
            borderBottom: '1px solid #f8fafc',
            background: n.is_read ? '#fff' : '#fafbff',
            cursor: n.is_read ? 'default' : 'pointer',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {cfg.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#0f172a', lineHeight: 1.3 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{n.message}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
            </div>
            {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 4 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Full Notification Control Panel ──────────────────────────────────────────
export function NotificationControlPanel({ showToast }: { showToast: (m: string, i?: string) => void }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [filterAud, setFilterAud] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // School multi-select for compose
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [schoolDropOpen, setSchoolDropOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const schoolDropRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ audience: 'school', type: 'info', title: '', message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/schools?status=approved`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSchools(d?.schools ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (schoolDropRef.current && !schoolDropRef.current.contains(e.target as Node)) setSchoolDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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

  const toggleSchool = (id: string) => {
    setSelectedSchools(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const filteredSchoolOptions = schools.filter(s =>
    !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.school_code.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) { showToast('Title and message are required', '⚠️'); return; }
    setSending(true);

    // Send to each selected school, or broadcast if none selected
    const schoolIds = selectedSchools.length > 0 ? selectedSchools : [null];

    for (const schoolId of schoolIds) {
      const body: any = { audience: form.audience, type: form.type, title: form.title, message: form.message };
      if (schoolId) body.school_id = schoolId;
      await authFetch(`${BACKEND}/api/admin/notifications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setSending(false);
    showToast(`Notification sent to ${selectedSchools.length > 0 ? `${selectedSchools.length} school(s)` : 'all schools'}!`, '✅');
    setForm({ audience: 'school', type: 'info', title: '', message: '' });
    setSelectedSchools([]);
    setComposeOpen(false);
    loadNotifications();
  };

  const markAllRead = async () => {
    await authFetch(`${BACKEND}/api/admin/notifications`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    loadNotifications();
  };

  const filtered = notifications.filter(n => {
    if (filterAud !== 'all' && n.audience !== filterAud) return false;
    if (filterType !== 'all' && n.type !== filterType) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const selectedSchoolNames = selectedSchools.map(id => schools.find(s => s.id === id)?.name ?? '').filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── Stats Row ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { icon: '📬', label: 'Total', value: notifications.length, color: '#6366f1', bg: '#eef2ff' },
          { icon: '🔴', label: 'Unread', value: unreadCount, color: '#ef4444', bg: '#fff1f2' },
          { icon: '🏫', label: 'Schools', value: notifications.filter(n => n.audience === 'school' || n.audience === 'both').length, color: '#10b981', bg: '#ecfdf5' },
          { icon: '📢', label: 'Broadcast', value: notifications.filter(n => !n.school_id).length, color: '#f59e0b', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.color}25`, borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Header + Compose button ─────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>🔔 Notification Control Panel</h3>
          {unreadCount > 0 && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {unreadCount} unread ·{' '}
              <span style={{ color: '#6366f1', cursor: 'pointer', fontWeight: 700 }} onClick={markAllRead}>Mark all read</span>
            </div>
          )}
        </div>
        <button onClick={() => setComposeOpen(v => !v)} style={{
          padding: '10px 22px', borderRadius: 12, border: 'none',
          background: composeOpen ? '#f1f5f9' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: composeOpen ? '#475569' : '#fff',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          boxShadow: composeOpen ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
          transition: 'all 0.2s',
        }}>
          {composeOpen ? '✕ Cancel' : '✉️ Send Notification'}
        </button>
      </div>

      {/* ── Compose Panel ──────────────────────────────── */}
      {composeOpen && (
        <div style={{ background: '#fff', borderRadius: 20, border: '2px solid #6366f1', overflow: 'hidden', boxShadow: '0 4px 24px rgba(99,102,241,0.12)' }}>
          <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '16px 22px' }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>✉️ Compose Notification</h4>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Send to specific schools or broadcast to all</p>
          </div>

          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Target Schools multi-select */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Target Schools {selectedSchools.length === 0 ? <span style={{ color: '#94a3b8', fontWeight: 500, textTransform: 'none' }}>(blank = broadcast to all)</span> : <span style={{ color: '#6366f1', fontWeight: 800 }}>({selectedSchools.length} selected)</span>}
              </label>
              <div ref={schoolDropRef} style={{ position: 'relative' }}>
                <div onClick={() => setSchoolDropOpen(v => !v)} style={{
                  border: `2px solid ${schoolDropOpen ? '#6366f1' : '#e2e8f0'}`, borderRadius: 12,
                  padding: '10px 14px', cursor: 'pointer', background: '#f8fafc',
                  minHeight: 44, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                  boxShadow: schoolDropOpen ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                }}>
                  {selectedSchools.length === 0 ? (
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>📢 All schools (broadcast)…</span>
                  ) : (
                    <>
                      {selectedSchoolNames.slice(0, 3).map((name, i) => (
                        <span key={i} style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{name}</span>
                      ))}
                      {selectedSchools.length > 3 && (
                        <span style={{ background: '#e2e8f0', color: '#475569', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>+{selectedSchools.length - 3} more</span>
                      )}
                    </>
                  )}
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 10 }}>▼</span>
                </div>

                {schoolDropOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
                    background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden',
                  }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <input placeholder="🔍 Search schools..." value={schoolSearch}
                        onChange={e => setSchoolSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <button onClick={() => setSelectedSchools(schools.map(s => s.id))}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Select All
                      </button>
                      <button onClick={() => setSelectedSchools([])}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Clear (Broadcast)
                      </button>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {filteredSchoolOptions.map(s => {
                        const sel = selectedSchools.includes(s.id);
                        return (
                          <label key={s.id} onClick={() => toggleSchool(s.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            cursor: 'pointer', background: sel ? '#eef2ff' : 'transparent',
                            borderBottom: '1px solid #f8fafc',
                          }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${sel ? '#6366f1' : '#cbd5e1'}`,
                              background: sel ? '#6366f1' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {sel && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: '#0f172a' }}>{s.name}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.school_code}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Audience */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Audience</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(AUDIENCE_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, audience: k }))} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 10, border: `1.5px solid ${form.audience === k ? v.color : '#e2e8f0'}`,
                      background: form.audience === k ? v.bg : '#f8fafc',
                      color: form.audience === k ? v.color : '#64748b',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Type</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, type: k }))} style={{
                      padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${form.type === k ? v.color : '#e2e8f0'}`,
                      background: form.type === k ? v.bg : '#f8fafc',
                      color: form.type === k ? v.color : '#64748b',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Title *</label>
              <input type="text" placeholder="Notification title..." value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0f172a', background: '#f8fafc', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Message */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Message *</label>
              <textarea rows={3} placeholder="Message content..." value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0f172a', background: '#f8fafc', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' }}
              />
            </div>

            {/* Preview */}
            {form.title && form.message && (
              <div style={{ background: TYPE_CONFIG[form.type]?.bg ?? '#f8fafc', border: `1.5px solid ${TYPE_CONFIG[form.type]?.color ?? '#e2e8f0'}25`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Preview</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22 }}>{TYPE_CONFIG[form.type]?.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{form.title}</div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{form.message}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                      → {selectedSchools.length === 0 ? 'All schools' : `${selectedSchools.length} school(s)`} · {AUDIENCE_CONFIG[form.audience]?.label}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !form.title.trim() || !form.message.trim()} style={{
              padding: '12px 28px', borderRadius: 12, border: 'none',
              background: (sending || !form.title.trim() || !form.message.trim()) ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: (sending || !form.title.trim() || !form.message.trim()) ? '#94a3b8' : '#fff',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              boxShadow: (sending || !form.title.trim() || !form.message.trim()) ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
              alignSelf: 'flex-start',
            }}>
              {sending ? '⏳ Sending...' : `📤 Send${selectedSchools.length > 0 ? ` to ${selectedSchools.length} school(s)` : ' to All Schools'}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Filter:</span>
        {['all', 'admin', 'school', 'both'].map(a => (
          <button key={a} onClick={() => setFilterAud(a)} style={{
            padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterAud === a ? '#6366f1' : '#e2e8f0'}`,
            background: filterAud === a ? '#eef2ff' : '#f8fafc',
            color: filterAud === a ? '#6366f1' : '#64748b',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {a === 'all' ? 'All' : AUDIENCE_CONFIG[a]?.label ?? a}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
        {['all', ...Object.keys(TYPE_CONFIG)].map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{
            padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterType === t ? (TYPE_CONFIG[t]?.color ?? '#6366f1') : '#e2e8f0'}`,
            background: filterType === t ? (TYPE_CONFIG[t]?.bg ?? '#eef2ff') : '#f8fafc',
            color: filterType === t ? (TYPE_CONFIG[t]?.color ?? '#6366f1') : '#64748b',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {t === 'all' ? 'All Types' : `${TYPE_CONFIG[t]?.icon} ${TYPE_CONFIG[t]?.label}`}
          </button>
        ))}
      </div>

      {/* ── Notification List ───────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔕</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 4 }}>No notifications found</div>
            <div style={{ fontSize: 13 }}>Send your first notification above</div>
          </div>
        ) : filtered.map((n, idx) => {
          const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
          const aud = AUDIENCE_CONFIG[n.audience] ?? AUDIENCE_CONFIG.both;
          return (
            <div key={n.id} style={{
              display: 'flex', gap: 16, padding: '16px 20px',
              borderBottom: idx < filtered.length - 1 ? '1px solid #f8fafc' : 'none',
              background: n.is_read ? '#fff' : '#fafbff',
              transition: 'background 0.15s',
            }}>
              {/* Left accent */}
              <div style={{ width: 4, borderRadius: 4, background: n.is_read ? '#f1f5f9' : cfg.color, flexShrink: 0, alignSelf: 'stretch' }} />

              {/* Icon */}
              <div style={{ width: 40, height: 40, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {cfg.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, color: '#0f172a' }}>{n.title}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: aud.bg, color: aud.color, fontWeight: 700 }}>{aud.label}</span>
                  {!n.is_read && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#3b82f6', fontWeight: 700 }}>Unread</span>}
                </div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  {timeAgo(n.created_at)}
                  {n.entity_type && ` · ${n.entity_type}`}
                </div>
              </div>

              {/* Unread dot */}
              {!n.is_read && (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 6, boxShadow: `0 0 6px ${cfg.color}80` }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
