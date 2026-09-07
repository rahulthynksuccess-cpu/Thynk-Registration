'use client';
// components/admin/FollowupModal.tsx
// Shared "Follow-up" panel for both Consultants and Schools.
// Shows the full history (comment, date & time, user name) and lets the
// admin log a new comment and/or set the next follow-up date.

import React, { useEffect, useState } from 'react';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};
const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const inp: React.CSSProperties = { width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' };

export default function FollowupModal({
  entityType, entityId, entityName, onClose, showToast, onSaved,
}: {
  entityType: 'consultant' | 'school';
  entityId:   string;
  entityName: string;
  onClose:    () => void;
  showToast:  (t: string, i?: string) => void;
  onSaved?:   (nextFollowupDate: string | null) => void;
}) {
  const [history, setHistory] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/followups?entity_type=${entityType}&entity_id=${entityId}`);
      const data = await res.json();
      setHistory(data.followups ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [entityType, entityId]);

  async function handleSave() {
    if (!comment.trim() && !nextDate) {
      showToast('Add a comment and/or pick a next follow-up date', '⚠️');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, comment: comment.trim() || null, next_followup_date: nextDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Failed to save follow-up', '❌'); setSaving(false); return; }
      showToast('Follow-up saved', '✅');
      setComment('');
      onSaved?.(nextDate || null);
      await load();
    } catch (e: any) {
      showToast(e.message ?? 'Failed', '❌');
    }
    setSaving(false);
  }

  const latest = history[0];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>📅 Follow-up</h3>
            <div style={{ fontSize: 12, color: 'var(--m)', marginTop: 3 }}>{entityName}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 22, lineHeight: 1 }}>&#x2715;</button>
        </div>

        <div style={{ padding: '20px 24px 28px' }}>
          {/* New follow-up form */}
          <div style={{ background: 'var(--bg)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: 16, marginBottom: 22 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Comment</label>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)}
                placeholder="What was discussed / next steps…" />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={lbl}>Next Follow-up Date</label>
                <input type="date" style={inp} value={nextDate} onChange={e => setNextDate(e.target.value)} />
              </div>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: saving ? 'var(--bd)' : 'linear-gradient(135deg,#4f46e5,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                {saving ? '⏳ Saving…' : '💾 Save Follow-up'}
              </button>
            </div>
          </div>

          {/* Latest snapshot */}
          {latest && (
            <div style={{ marginBottom: 18, padding: '10px 14px', background: 'rgba(79,70,229,.06)', border: '1px solid rgba(79,70,229,.2)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Last Comment</div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>{latest.comment || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--m)' }}>
                by <strong>{latest.created_by_name || 'Admin'}</strong> · {fmtDateTime(latest.created_at)}
                {latest.next_followup_date && <> · Next: <strong>{fmtDate(latest.next_followup_date)}</strong></>}
              </div>
            </div>
          )}

          {/* History */}
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            History {history.length > 0 && `(${history.length})`}
          </div>
          {loading && <div style={{ fontSize: 13, color: 'var(--m)', padding: '12px 0' }}>Loading…</div>}
          {!loading && history.length === 0 && <div style={{ fontSize: 13, color: 'var(--m)', padding: '12px 0' }}>No follow-ups logged yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(h => (
              <div key={h.id} style={{ border: '1.5px solid var(--bd)', borderRadius: 12, padding: '10px 14px', background: 'var(--bg)' }}>
                {h.comment && <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6, lineHeight: 1.5 }}>{h.comment}</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--m)' }}>
                  <span>👤 {h.created_by_name || 'Admin'}</span>
                  <span>🕒 {fmtDateTime(h.created_at)}</span>
                  {h.next_followup_date && <span>📅 Next: <strong style={{ color: 'var(--text)' }}>{fmtDate(h.next_followup_date)}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
