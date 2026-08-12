'use client';
import { authFetch } from '@/lib/supabase/client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useCallback } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

// Simple random key — 32 bytes, base64url-ish (no external deps needed on the client).
function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'tfk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ThynkFlowIntegrationPage() {
  const [existing, setExisting] = useState<{ id?: string; config?: { api_key?: string } } | null>(null);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    authFetch(`${BACKEND}/api/admin/integrations`).then(r => r.ok ? r.json() : null).then(d => {
      const row = (d?.integrations ?? []).find((i: any) => i.provider === 'thynkflow_crm' && !i.school_id);
      if (row) setExisting(row);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const save = async (newKey: string) => {
    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/integrations`, {
        method: existing?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(existing?.id ? { id: existing.id } : {}),
          provider: 'thynkflow_crm', school_id: null, config: { api_key: newKey }, is_active: true,
        }),
      });
      if (res.ok) { showToast('✅ Saved — paste this key into ThynkFlow → Settings → Registration Sync'); load(); setKey(''); }
      else { const e = await res.json().catch(() => ({})); showToast('❌ ' + (e.error || 'Failed to save')); }
    } catch (err: any) { showToast('❌ ' + err.message); }
    finally { setSaving(false); }
  };

  const rotate = () => {
    const k = generateKey();
    setKey(k);
    save(k);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
        🔗 ThynkFlow CRM Integration
      </h1>
      <p style={{ fontSize: 13, color: 'var(--m)', marginBottom: 24 }}>
        This key lets ThynkFlow's backend create schools here (status: pending approval) when a consultant taps
        "Create School" on a Converted lead. Treat it like a password.
      </p>

      <div style={{ background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
          Current Status
        </div>
        {existing?.config?.api_key ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>✅ Key configured</span>
            <code style={{ fontSize: 12, background: 'var(--bg)', padding: '3px 8px', borderRadius: 6, color: 'var(--text)' }}>
              ••••{existing.config.api_key.slice(-6)}
            </code>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600, marginBottom: 16 }}>⚠️ No key set yet</p>
        )}

        <button
          onClick={rotate}
          disabled={saving}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: saving ? 'rgba(79,70,229,.5)' : '#4f46e5', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
          {saving ? '⏳ Generating…' : existing?.config?.api_key ? '🔄 Rotate Key' : '✨ Generate Key'}
        </button>

        {key && (
          <div style={{ marginTop: 16, background: 'rgba(79,70,229,.06)', border: '1px solid rgba(79,70,229,.2)', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 12, color: '#4f46e5', fontWeight: 700, marginBottom: 6 }}>
              Copy this now — paste it into ThynkFlow → Settings → Registration Sync → API Key:
            </p>
            <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--text)' }}>{key}</code>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--text)', color: 'var(--card)', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
