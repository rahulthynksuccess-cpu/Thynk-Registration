'use client';
/**
 * components/admin/LeadDatabase.tsx
 * Full Lead Database module — import, view, update, communicate
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authFetch } from '@/lib/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;

interface Lead {
  id: string;
  school_id: string;
  project_id?: string;
  student_name?: string;
  grade?: string;
  parent_name?: string;
  mobile?: string;
  email?: string;
  status: LeadStatus;
  notes?: string;
  source?: string;
  created_at: string;
  schools?: { id: string; name: string; school_code: string; project_id?: string };
}

type LeadStatus =
  | 'new'
  | 'previous_participant'
  | 'previous_lead'
  | 'converted'
  | 'lost'
  | 'interested'
  | 'not_reachable';

// ── Constants ─────────────────────────────────────────────────────────────────
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const LEAD_STATUSES: { value: LeadStatus; label: string; color: string; bg: string; icon: string }[] = [
  { value: 'new',                  label: 'New',                  color: '#4f46e5', bg: 'rgba(79,70,229,0.1)',   icon: '🆕' },
  { value: 'interested',           label: 'Interested',           color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',   icon: '🌟' },
  { value: 'previous_participant', label: 'Previous Participant', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  icon: '🏅' },
  { value: 'previous_lead',        label: 'Previous Lead',        color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '📋' },
  { value: 'converted',            label: 'Converted',            color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '✅' },
  { value: 'lost',                 label: 'Lost',                 color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: '❌' },
  { value: 'not_reachable',        label: 'Not Reachable',        color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',icon: '📵' },
];

const STATUS_META = Object.fromEntries(LEAD_STATUSES.map(s => [s.value, s]));

// Shared input style
const IS: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box',
};
const SS: React.CSSProperties = { ...IS, appearance: 'none' as any, cursor: 'pointer' };

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: m.color, background: m.bg,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

// ── Excel parser (client-side, no lib needed) ─────────────────────────────────
// We use FileReader + a tiny CSV/TSV + xlsx hack via ArrayBuffer
async function parseExcel(file: File): Promise<Row[]> {
  // If it's a CSV we parse directly
  if (file.name.endsWith('.csv')) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) { resolve([]); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(',');
          const obj: Row = {};
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
          return obj;
        });
        resolve(rows);
      };
      reader.readAsText(file);
    });
  }

  // For .xlsx we use the SheetJS CDN if available, otherwise prompt CSV
  const XLSX = (window as any).XLSX;
  if (!XLSX) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Try tab-separated
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) { resolve([]); return; }
        const sep = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const rows = lines.slice(1).map(line => {
          const vals = line.split(sep);
          const obj: Row = {};
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
          return obj;
        });
        resolve(rows);
      };
      reader.readAsText(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data   = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb     = XLSX.read(data, { type: 'array' });
        const ws     = wb.Sheets[wb.SheetNames[0]];
        const json   = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Row[];
        // Normalise headers
        const norm   = json.map(r => {
          const out: Row = {};
          Object.keys(r).forEach(k => { out[k.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')] = r[k]; });
          return out;
        });
        resolve(norm);
      } catch { resolve([]); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Map raw Excel row to lead field by guessing column names
function mapRowToLead(row: Row): Partial<Lead> {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.replace(/_/g, '')] ?? row[k.replace(/_/g, ' ')];
      if (v !== undefined && v !== '') return String(v).trim();
    }
    return undefined;
  };
  return {
    student_name: get('student_name','name','student','child_name','childname'),
    grade:        get('grade','class','class_grade','std','standard'),
    parent_name:  get('parent_name','parent','father_name','mother_name','guardian'),
    mobile:       get('mobile','phone','contact','number','mobile_number','phone_number','contact_number'),
    email:        get('email','email_id','mail','parent_email','contact_email'),
  };
}

// ── Lead Detail / Edit Modal ──────────────────────────────────────────────────
function LeadDetailModal({
  lead, onClose, onSaved, showToast, templates, schools,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
  showToast: (m: string, i?: string) => void;
  templates: Row[];
  schools: Row[];
}) {
  const [status, setStatus]     = useState<LeadStatus>(lead.status);
  const [notes, setNotes]       = useState(lead.notes ?? '');
  const [saving, setSaving]     = useState(false);
  const [sendCh, setSendCh]     = useState<'whatsapp'|'email'|null>(null);
  const [tplId,  setTplId]      = useState('');
  const [toAddr, setToAddr]     = useState('');
  const [preview, setPreview]   = useState('');
  const [sending, setSending]   = useState(false);

  const chanTpls = templates.filter(t => t.channel === sendCh && t.is_active !== false);

  // Template preview
  useEffect(() => {
    if (!tplId || !sendCh) { setPreview(''); return; }
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const vars: Record<string,string> = {
      student_name: lead.student_name ?? '',
      parent_name:  lead.parent_name  ?? '',
      grade:        lead.grade        ?? '',
      mobile:       lead.mobile       ?? '',
      email:        lead.email        ?? '',
      school_name:  lead.schools?.name ?? '',
    };
    setPreview(tpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`));
  }, [tplId, sendCh, templates, lead]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status, notes }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? 'Failed', '❌'); return; }
      showToast('Lead updated!', '✅');
      onSaved({ ...lead, status, notes });
    } finally { setSaving(false); }
  }

  async function handleSend() {
    if (!sendCh || !tplId || !toAddr) return;
    setSending(true);
    try {
      const school = schools.find(s => s.id === lead.school_id);
      const res = await authFetch(`${BACKEND}/api/admin/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: sendCh, template_id: tplId,
          school_id: lead.school_id,
          to_phone: sendCh === 'whatsapp' ? toAddr : lead.mobile,
          to_email: sendCh === 'email'    ? toAddr : lead.email,
          vars: {
            student_name: lead.student_name ?? '', parent_name: lead.parent_name ?? '',
            grade: lead.grade ?? '', mobile: lead.mobile ?? '', email: lead.email ?? '',
            school_name: school?.name ?? '',
          },
        }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`✅ ${sendCh === 'whatsapp' ? 'WhatsApp' : 'Email'} sent!`, '✅');
        setSendCh(null); setTplId(''); setPreview('');
      } else {
        showToast(`❌ ${d.error}`, '❌');
      }
    } finally { setSending(false); }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              {lead.student_name ?? 'Lead Details'}
            </h3>
            <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3 }}>{lead.schools?.name ?? '—'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>

        {/* Info rows */}
        <div style={{ padding: '0 24px' }}>
          {([
            ['Grade / Class', lead.grade],
            ['Parent Name',   lead.parent_name],
            ['Mobile',        lead.mobile ? <a href={`tel:${lead.mobile}`} style={{ color: 'var(--acc)', fontWeight: 600 }}>{lead.mobile}</a> : '—'],
            ['Email',         lead.email  ? <a href={`mailto:${lead.email}`} style={{ color: 'var(--acc)', fontSize: 12 }}>{lead.email}</a> : '—'],
            ['School',        lead.schools?.name],
            ['Source',        lead.source],
            ['Imported',      new Date(lead.created_at).toLocaleDateString('en-IN')],
          ] as [string, any][]).map(([l, v]) => v ? (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ fontSize: 12, color: 'var(--m)', minWidth: 90 }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
            </div>
          ) : null)}
        </div>

        {/* Edit status + notes */}
        <div style={{ padding: '16px 24px', borderTop: '1.5px solid var(--bd)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Update Lead</div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 5 }}>Status</label>
            <select style={{ ...SS }} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
              {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 5 }}>Notes</label>
            <textarea style={{ ...IS, height: 70, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this lead…" />
          </div>
          <button
            onClick={handleSave} disabled={saving}
            style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: 'var(--acc)', border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '⏳ Saving…' : '💾 Save Changes'}
          </button>
        </div>

        {/* Communication buttons */}
        {!sendCh && (
          <div style={{ display: 'flex', gap: 10, padding: '0 24px 20px' }}>
            <button
              onClick={() => { setSendCh('whatsapp'); setToAddr(lead.mobile ?? ''); }}
              disabled={!lead.mobile}
              style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1.5px solid rgba(26,184,168,.35)', background: 'rgba(26,184,168,.08)', color: '#0e8a7d', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: lead.mobile ? 'pointer' : 'not-allowed', opacity: lead.mobile ? 1 : 0.4 }}>
              💬 WhatsApp
            </button>
            <button
              onClick={() => { setSendCh('email'); setToAddr(lead.email ?? ''); }}
              disabled={!lead.email}
              style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1.5px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.07)', color: '#b45309', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: lead.email ? 'pointer' : 'not-allowed', opacity: lead.email ? 1 : 0.4 }}>
              ✉️ Email
            </button>
          </div>
        )}

        {/* Send form */}
        {sendCh && (
          <div style={{ margin: '0 24px 20px', padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1.5px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: 14, fontWeight: 700 }}>
              {sendCh === 'whatsapp' ? '💬 Send WhatsApp' : '✉️ Send Email'}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)', marginBottom: 5 }}>
                {sendCh === 'whatsapp' ? 'Phone Number' : 'Email Address'}
              </label>
              <input style={IS} value={toAddr} onChange={e => setToAddr(e.target.value)}
                placeholder={sendCh === 'whatsapp' ? '91XXXXXXXXXX' : 'email@example.com'} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)', marginBottom: 5 }}>Template *</label>
              <select style={{ ...SS }} value={tplId} onChange={e => setTplId(e.target.value)}>
                <option value="">— Choose template —</option>
                {chanTpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                {chanTpls.length === 0 && <option disabled>No active {sendCh} templates</option>}
              </select>
            </div>
            {preview && (
              <div style={{ background: 'var(--card)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', marginBottom: 5 }}>Preview</div>
                {preview}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setSendCh(null); setTplId(''); setPreview(''); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--bd)', background: 'var(--card)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--m)' }}>
                Cancel
              </button>
              <button onClick={handleSend}
                disabled={sending || !tplId || !toAddr}
                style={{ flex: 2, padding: '9px 0', borderRadius: 9, background: sendCh === 'whatsapp' ? '#1ab8a8' : 'var(--acc)', border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: (sending || !tplId || !toAddr) ? 'not-allowed' : 'pointer', opacity: (sending || !tplId || !toAddr) ? 0.6 : 1 }}>
                {sending ? '⏳ Sending…' : `Send ${sendCh === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Communicate Modal ────────────────────────────────────────────────────
function BroadcastModal({
  leads, schools, templates, onClose, showToast,
}: {
  leads: Lead[];
  schools: Row[];
  templates: Row[];
  onClose: () => void;
  showToast: (m: string, i?: string) => void;
}) {
  const [step,         setStep]         = useState<1|2|3|4>(1);
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([]);
  const [selected,     setSelected]     = useState<Set<string>>(new Set(leads.map(l => l.id)));
  const [search,       setSearch]       = useState('');
  const [channel,      setChannel]      = useState<'email'|'whatsapp'|''>('');
  const [tplId,        setTplId]        = useState('');
  const [sending,      setSending]      = useState(false);
  const [result,       setResult]       = useState<any>(null);

  const filtered = useMemo(() => {
    let base = leads;
    if (statusFilter.length) base = base.filter(l => statusFilter.includes(l.status));
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(l =>
        l.student_name?.toLowerCase().includes(q) ||
        l.parent_name?.toLowerCase().includes(q)  ||
        l.mobile?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.grade?.toLowerCase().includes(q) ||
        l.schools?.name?.toLowerCase().includes(q)
      );
    }
    return base;
  }, [leads, statusFilter, search]);

  const selectedLeads = leads.filter(l => selected.has(l.id));
  const chanTpls = templates.filter(t => t.channel === channel && t.is_active !== false);
  const selTpl   = templates.find(t => t.id === tplId);

  function toggleLead(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll()  { setSelected(new Set(filtered.map(l => l.id))); }
  function clearAll()   { setSelected(new Set()); }

  async function handleSend() {
    if (!channel || !tplId || !selected.size) return;
    setSending(true);
    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0;

    // Group by school for school_id
    for (const lead of selectedLeads) {
      const school = schools.find(s => s.id === lead.school_id);
      const vars = {
        student_name: lead.student_name ?? '', parent_name: lead.parent_name ?? '',
        grade: lead.grade ?? '', mobile: lead.mobile ?? '', email: lead.email ?? '',
        school_name: school?.name ?? '',
      };

      const to_phone = lead.mobile;
      const to_email = lead.email;

      if (channel === 'whatsapp' && !to_phone) {
        results.push({ name: lead.student_name ?? '—', status: 'skipped', error: 'No phone' });
        skipped++; continue;
      }
      if (channel === 'email' && !to_email) {
        results.push({ name: lead.student_name ?? '—', status: 'skipped', error: 'No email' });
        skipped++; continue;
      }

      try {
        const res = await authFetch(`${BACKEND}/api/admin/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel, template_id: tplId,
            school_id: lead.school_id,
            to_phone: channel === 'whatsapp' ? to_phone : undefined,
            to_email: channel === 'email'    ? to_email : undefined,
            vars,
          }),
        });
        const d = await res.json();
        if (res.ok) {
          results.push({ name: lead.student_name ?? '—', status: 'sent', recipient: channel === 'whatsapp' ? to_phone : to_email });
          sent++;
        } else {
          results.push({ name: lead.student_name ?? '—', status: 'failed', error: d.error });
          failed++;
        }
      } catch (e: any) {
        results.push({ name: lead.student_name ?? '—', status: 'failed', error: e.message });
        failed++;
      }
    }

    setSending(false);
    setResult({ sent, failed, skipped, total: results.length, results });
    setStep(4);
    showToast(`Sent ${sent} · Failed ${failed} · Skipped ${skipped}`, '📢');
  }

  const card: React.CSSProperties = { background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div style={{ background: 'var(--bg)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>📢 Communicate with Leads</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--m)' }}>{leads.length} leads available</p>
          </div>
          {!sending && <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--m)' }}>✕</button>}
        </div>

        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 0, overflowX: 'auto' }}>
            {([
              [1, 'Filter Leads'],
              [2, 'Select Leads'],
              [3, 'Channel & Template'],
              [4, 'Results'],
            ] as [number, string][]).map(([n, label], i, arr) => (
              <React.Fragment key={n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: n < step ? 'pointer' : 'default', opacity: n > step ? 0.4 : 1 }}
                  onClick={() => { if (n < step && step < 4) setStep(n as any); }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 11, flexShrink: 0,
                    background: step > n ? '#10b981' : step === n ? 'var(--acc)' : 'var(--bg)',
                    color: step >= n ? '#fff' : 'var(--m)',
                    border: `2px solid ${step > n ? '#10b981' : step === n ? 'var(--acc)' : 'var(--bd)'}`,
                  }}>{step > n ? '✓' : n}</div>
                  <span style={{ fontSize: 12, fontWeight: step === n ? 700 : 500, whiteSpace: 'nowrap', color: step === n ? 'var(--acc)' : step > n ? '#10b981' : 'var(--m)' }}>{label}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 2, minWidth: 12, background: step > n ? '#10b981' : 'var(--bd)', margin: '0 6px' }} />}
              </React.Fragment>
            ))}
          </div>

          {/* ── STEP 1: Filter ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🎯 Filter by Lead Status</div>
              <div style={{ fontSize: 12, color: 'var(--m)', marginBottom: 16 }}>Select which statuses to include. Leave blank for all leads.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {LEAD_STATUSES.map(s => {
                  const active = statusFilter.includes(s.value);
                  return (
                    <div key={s.value}
                      onClick={() => setStatusFilter(p => active ? p.filter(x => x !== s.value) : [...p, s.value])}
                      style={{ padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, userSelect: 'none',
                        border: `1.5px solid ${active ? s.color : 'var(--bd)'}`,
                        background: active ? s.bg : 'transparent', color: active ? s.color : 'var(--m)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                      {s.icon} {s.label}
                      <span style={{ fontSize: 10, opacity: .7 }}>({leads.filter(l => l.status === s.value).length})</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--bd)', fontSize: 12, color: 'var(--m)', marginBottom: 16 }}>
                {statusFilter.length === 0 ? `✅ All ${leads.length} leads included` : `✅ ${leads.filter(l => statusFilter.includes(l.status)).length} leads match selected statuses`}
              </div>
              <button className="btn btn-primary" onClick={() => setStep(2)}>Next: Select Individual Leads →</button>
            </div>
          )}

          {/* ── STEP 2: Select Leads ───────────────────────────────────────── */}
          {step === 2 && (
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>👥 Select Leads</div>
              <div style={{ fontSize: 12, color: 'var(--m)', marginBottom: 12 }}>{filtered.length} leads in view · {selected.size} selected</div>

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--m)', fontSize: 13 }}>🔍</span>
                <input style={{ ...IS, paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, email, school…" />
              </div>

              {/* Bulk actions */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <button onClick={selectAll} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #10b981', background: 'rgba(16,185,129,0.08)', color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✅ Select All ({filtered.length})</button>
                <button onClick={clearAll} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #ef4444', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🚫 Clear All</button>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--acc)' }}>{selected.size} selected</span>
              </div>

              {/* Lead list */}
              <div style={{ border: '1.5px solid var(--bd)', borderRadius: 10, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--m)', fontSize: 13 }}>No leads match current filter.</div>
                ) : filtered.map(l => {
                  const isSel = selected.has(l.id);
                  const sm    = STATUS_META[l.status];
                  return (
                    <div key={l.id} onClick={() => toggleLead(l.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: isSel ? 'var(--acc3)' : 'transparent', transition: 'background .1s' }}>
                      <input type="checkbox" readOnly checked={isSel} style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.student_name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--m)' }}>{l.grade ? `Grade ${l.grade} · ` : ''}{l.schools?.name ?? ''}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--m)', textAlign: 'right', flexShrink: 0 }}>
                        {l.mobile && <div>📱 {l.mobile}</div>}
                        {l.email  && <div style={{ fontSize: 10 }}>✉️ {l.email}</div>}
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: sm.bg, color: sm.color, fontWeight: 700, flexShrink: 0 }}>
                        {sm.icon}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => setStep(3)}>
                  Next: Channel & Template ({selected.size} leads) →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Channel + Template ────────────────────────────────── */}
          {step === 3 && (
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>✉️ Channel & Template</div>
              <div style={{ fontSize: 12, color: 'var(--m)', marginBottom: 18 }}>Choose how to reach {selected.size} leads.</div>

              {/* Channel */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Channel</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {([['email' as const, '✉️', 'Email'], ['whatsapp' as const, '💬', 'WhatsApp']] as const).map(([id, icon, label]) => (
                    <div key={id} onClick={() => { setChannel(id); setTplId(''); }}
                      style={{ flex: 1, padding: '14px 18px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                        border: `2px solid ${channel === id ? 'var(--acc)' : 'var(--bd)'}`,
                        background: channel === id ? 'var(--acc3)' : 'var(--bg)',
                      }}>
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: channel === id ? 'var(--acc)' : 'var(--text)' }}>{label}</span>
                      {channel === id && <span style={{ marginLeft: 'auto' }}>✅</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Template */}
              {channel && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                    Template · {chanTpls.length} active {channel} templates
                  </div>
                  {chanTpls.length === 0 ? (
                    <div style={{ padding: 14, borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444' }}>
                      No active {channel} templates. Create one in Message Templates.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {chanTpls.map(t => (
                        <div key={t.id} onClick={() => setTplId(t.id)}
                          style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${tplId === t.id ? 'var(--acc)' : 'var(--bd)'}`,
                            background: tplId === t.id ? 'var(--acc3)' : 'var(--bg)',
                          }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: tplId === t.id ? 'var(--acc)' : 'var(--text)' }}>{t.name}</div>
                          {t.subject && <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3 }}>Subject: {t.subject}</div>}
                          <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body?.slice(0, 100)}…</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              {channel && tplId && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.25)', marginBottom: 16, fontSize: 12, lineHeight: 2 }}>
                  <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 4 }}>📋 Ready to Send</div>
                  <div>📡 Channel: <strong>{channel}</strong></div>
                  <div>👥 Recipients: <strong>{selected.size} leads</strong></div>
                  <div>📄 Template: <strong>{selTpl?.name}</strong></div>
                  {channel === 'whatsapp' && <div style={{ fontSize: 11, color: 'var(--m)' }}>⚠️ {selectedLeads.filter(l => !l.mobile).length} leads have no phone number and will be skipped.</div>}
                  {channel === 'email'    && <div style={{ fontSize: 11, color: 'var(--m)' }}>⚠️ {selectedLeads.filter(l => !l.email).length} leads have no email and will be skipped.</div>}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-primary" disabled={!channel || !tplId || sending} style={{ minWidth: 150 }} onClick={handleSend}>
                  {sending ? '⏳ Sending…' : '📢 Send Now'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Results ───────────────────────────────────────────── */}
          {step === 4 && result && (
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>📊 Broadcast Results</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {[{ label: 'Sent', val: result.sent, color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: '✅' },
                  { label: 'Failed', val: result.failed, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '❌' },
                  { label: 'Skipped', val: result.skipped, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '⚠️' },
                  { label: 'Total', val: result.total, color: 'var(--acc)', bg: 'var(--acc3)', icon: '📬' },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, minWidth: 100, padding: '14px 16px', borderRadius: 10, background: s.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'Sora,sans-serif' }}>{s.val}</div>
                    <div style={{ fontSize: 12, color: 'var(--m)', marginTop: 2 }}>{s.icon} {s.label}</div>
                  </div>
                ))}
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Recipient</th><th>Status</th><th>Note</th></tr></thead>
                  <tbody>
                    {result.results.map((r: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ fontSize: 12, color: 'var(--m)' }}>{r.recipient ?? '—'}</td>
                        <td><span className={`badge ${r.status === 'sent' ? 'badge-paid' : r.status === 'failed' ? 'badge-cancelled' : 'badge-pending'}`}>
                          {r.status === 'sent' ? '✅ Sent' : r.status === 'failed' ? '❌ Failed' : '⚠️ Skipped'}
                        </span></td>
                        <td style={{ fontSize: 11, color: 'var(--m)' }}>{r.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({
  schools, programs, onClose, onImported, showToast,
}: {
  schools: Row[];
  programs: Row[];
  onClose: () => void;
  onImported: () => void;
  showToast: (m: string, i?: string) => void;
}) {
  const [programId,  setProgramId]  = useState('');
  const [schoolId,   setSchoolId]   = useState('');
  const [file,       setFile]       = useState<File|null>(null);
  const [preview,    setPreview]    = useState<Row[]>([]);
  const [mapped,     setMapped]     = useState<Partial<Lead>[]>([]);
  const [step,       setStep]       = useState<1|2|3>(1);
  const [importing,  setImporting]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredSchools = useMemo(() =>
    schools.filter(s => programId ? s.project_id === programId : true)
  , [schools, programId]);

  async function handleFile(f: File) {
    setFile(f);
    const rows = await parseExcel(f);
    const mapped = rows.map(mapRowToLead);
    setPreview(rows.slice(0, 5));
    setMapped(mapped);
    setStep(2);
  }

  async function handleImport() {
    if (!schoolId || !mapped.length) return;
    const school = schools.find(s => s.id === schoolId);
    setImporting(true);
    try {
      const leads = mapped.map(l => ({
        ...l,
        school_id:  schoolId,
        project_id: school?.project_id ?? programId ?? null,
        source:     'excel_import',
        status:     'new',
      }));
      const res = await authFetch(`${BACKEND}/api/admin/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? 'Import failed', '❌'); return; }
      showToast(`✅ Imported ${d.inserted} leads!`, '✅');
      onImported();
    } finally { setImporting(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800 }}>📥 Import Leads from Excel</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--m)' }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Step 1: Program + School + File */}
          {step >= 1 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: step > 1 ? '#10b981' : 'var(--acc)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step > 1 ? '✓' : '1'}</span>
                Select Program & School
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 5 }}>Program (optional filter)</label>
                  <select style={SS} value={programId} onChange={e => { setProgramId(e.target.value); setSchoolId(''); }}>
                    <option value="">All Programs</option>
                    {programs.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 5 }}>School *</label>
                  <select style={SS} value={schoolId} onChange={e => setSchoolId(e.target.value)}>
                    <option value="">Select School</option>
                    {filteredSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* File upload */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 8 }}>Excel / CSV File *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed var(--bd)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg)', transition: 'all .15s' }}
                  onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--acc)'; }}
                  onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bd)'; }}
                  onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--bd)'; const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {file ? file.name : 'Drop Excel / CSV here or click to browse'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--m)' }}>
                    Supports .xlsx, .xls, .csv · Expected columns: Name, Grade, Parent Name, Mobile, Email
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Column mapping hint */}
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)', fontSize: 12, color: 'var(--m)' }}>
                💡 <strong>Auto-mapped columns:</strong> Any column with "name", "grade"/"class", "parent", "mobile"/"phone", "email" in its header is auto-detected. Column order doesn't matter.
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step >= 2 && mapped.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: step > 2 ? '#10b981' : 'var(--acc)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step > 2 ? '✓' : '2'}</span>
                Preview Mapped Data
                <span style={{ fontSize: 12, color: 'var(--m)', fontWeight: 400 }}>({mapped.length} rows found)</span>
              </div>
              <div className="tbl-wrap" style={{ marginBottom: 12 }}>
                <table>
                  <thead><tr><th>Student Name</th><th>Grade</th><th>Parent Name</th><th>Mobile</th><th>Email</th></tr></thead>
                  <tbody>
                    {mapped.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.student_name ?? <span style={{ color: 'var(--m)', fontStyle: 'italic' }}>—</span>}</td>
                        <td>{r.grade ?? <span style={{ color: 'var(--m)' }}>—</span>}</td>
                        <td>{r.parent_name ?? <span style={{ color: 'var(--m)' }}>—</span>}</td>
                        <td><code style={{ fontSize: 11 }}>{r.mobile ?? <span style={{ color: 'var(--m)' }}>—</span>}</code></td>
                        <td style={{ fontSize: 11 }}>{r.email ?? <span style={{ color: 'var(--m)' }}>—</span>}</td>
                      </tr>
                    ))}
                    {mapped.length > 8 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--m)', fontSize: 12, padding: '10px 0' }}>…and {mapped.length - 8} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 12, color: '#065f46' }}>
                ✅ <strong>{mapped.length} leads</strong> ready to import into <strong>{schools.find(s => s.id === schoolId)?.name ?? 'selected school'}</strong>.
                All rows imported (duplicates allowed — you can manage them after import).
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            {step >= 2 && mapped.length > 0 && (
              <button className="btn btn-primary"
                disabled={!schoolId || importing}
                onClick={handleImport}>
                {importing ? '⏳ Importing…' : `📥 Import ${mapped.length} Leads`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Status Update Bar ────────────────────────────────────────────────────
function BulkActionBar({
  selectedIds, onStatusUpdate, onDelete, onClear,
}: {
  selectedIds: string[];
  onStatusUpdate: (status: LeadStatus) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [statusVal, setStatusVal] = useState<LeadStatus>('new');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--acc3)', border: '1.5px solid var(--acc)', borderRadius: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--acc)' }}>{selectedIds.length} selected</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
        <select style={{ ...SS, width: 'auto', minWidth: 180, flex: 1 }} value={statusVal} onChange={e => setStatusVal(e.target.value as LeadStatus)}>
          {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
        </select>
        <button
          onClick={() => onStatusUpdate(statusVal)}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Update Status
        </button>
        <button
          onClick={onDelete}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          🗑️ Delete
        </button>
      </div>
      <button onClick={onClear} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--bd)', background: 'var(--card)', color: 'var(--m)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕ Clear</button>
    </div>
  );
}

// ── Main LeadDatabase Component ───────────────────────────────────────────────
export function LeadDatabase({
  programs, schools, templates, showToast,
}: {
  programs: Row[];
  schools:  Row[];
  templates: Row[];
  showToast: (m: string, i?: string) => void;
}) {
  const [leads,        setLeads]        = useState<Lead[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [filterProg,   setFilterProg]   = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [detailLead,   setDetailLead]   = useState<Lead|null>(null);
  const [showImport,   setShowImport]   = useState(false);
  const [showComms,    setShowComms]    = useState(false);

  const filteredSchools = useMemo(() =>
    schools.filter(s => filterProg ? s.project_id === filterProg : true)
  , [schools, filterProg]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSchool) params.set('school_id', filterSchool);
      if (filterProg)   params.set('project_id', filterProg);
      if (filterStatus) params.set('status', filterStatus);
      const res  = await authFetch(`${BACKEND}/api/admin/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads ?? []);
    } finally { setLoading(false); }
  }, [filterSchool, filterProg, filterStatus]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const displayed = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.student_name?.toLowerCase().includes(q) ||
      l.parent_name?.toLowerCase().includes(q)  ||
      l.mobile?.includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.grade?.toLowerCase().includes(q) ||
      l.schools?.name?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  // Stats
  const stats = useMemo(() => {
    const total = leads.length;
    const byStatus = Object.fromEntries(LEAD_STATUSES.map(s => [s.value, leads.filter(l => l.status === s.value).length]));
    const withPhone = leads.filter(l => l.mobile).length;
    const withEmail = leads.filter(l => l.email).length;
    return { total, byStatus, withPhone, withEmail };
  }, [leads]);

  function toggleSelect(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    displayed.length > 0 && selected.size === displayed.length
      ? setSelected(new Set())
      : setSelected(new Set(displayed.map(l => l.id)));
  }

  async function handleBulkStatus(status: LeadStatus) {
    if (!selected.size) return;
    try {
      const res = await authFetch(`${BACKEND}/api/admin/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      if (!res.ok) { showToast('Update failed', '❌'); return; }
      showToast(`Updated ${selected.size} leads to ${STATUS_META[status]?.label}`, '✅');
      setSelected(new Set());
      loadLeads();
    } catch { showToast('Network error', '❌'); }
  }

  async function handleBulkDelete() {
    if (!selected.size || !confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`${BACKEND}/api/admin/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) { showToast('Delete failed', '❌'); return; }
      showToast(`Deleted ${selected.size} leads`, '🗑️');
      setSelected(new Set());
      loadLeads();
    } catch { showToast('Network error', '❌'); }
  }

  return (
    <div>
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-left">
          <h1>Lead <span>Database</span></h1>
          <p>{stats.total} leads · {stats.withPhone} with phone · {stats.withEmail} with email</p>
        </div>
        <div className="topbar-right">
          <button className="btn btn-outline" onClick={() => setShowComms(true)} disabled={leads.length === 0}>
            📢 Communicate
          </button>
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>
            📥 Import Excel
          </button>
          <button className="btn btn-outline" onClick={loadLeads}>🔄 Refresh</button>
        </div>
      </div>

      {/* ── Status KPI strips ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {LEAD_STATUSES.map(s => (
          <div key={s.value}
            onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
            style={{
              flex: 1, minWidth: 110, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1.5px solid ${filterStatus === s.value ? s.color : 'var(--bd)'}`,
              background: filterStatus === s.value ? s.bg : 'var(--card)',
              transition: 'all .15s',
            }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Sora,sans-serif', color: s.color, lineHeight: 1 }}>
              {stats.byStatus[s.value] ?? 0}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--m)' }}>🔍</span>
          <input style={{ ...IS, paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email, grade…" />
        </div>
        {/* Program filter */}
        <select style={{ ...SS, width: 'auto', minWidth: 160 }} value={filterProg} onChange={e => { setFilterProg(e.target.value); setFilterSchool(''); }}>
          <option value="">All Programs</option>
          {programs.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* School filter */}
        <select style={{ ...SS, width: 'auto', minWidth: 180 }} value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
          <option value="">All Schools</option>
          {filteredSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {/* Status filter */}
        <select style={{ ...SS, width: 'auto', minWidth: 160, borderColor: filterStatus ? 'var(--acc)' : undefined, color: filterStatus ? 'var(--acc)' : undefined }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
        </select>
        {/* Clear */}
        {(filterProg || filterSchool || filterStatus || search) && (
          <button onClick={() => { setFilterProg(''); setFilterSchool(''); setFilterStatus(''); setSearch(''); }}
            style={{ padding: '9px 14px', borderRadius: 9, border: '1.5px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.06)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ✕ Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--m)', whiteSpace: 'nowrap' }}>{displayed.length} of {leads.length}</span>
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          onStatusUpdate={handleBulkStatus}
          onDelete={handleBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--m)' }}>⏳ Loading leads…</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--m)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No leads found</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Import an Excel/CSV file to get started</div>
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>📥 Import Leads</button>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" readOnly
                    checked={displayed.length > 0 && selected.size === displayed.length}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < displayed.length; }}
                    onChange={toggleAll}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--acc)' }} />
                </th>
                <th>Student Name</th>
                <th>Grade</th>
                <th>Parent Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>School</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(l => (
                <tr key={l.id} onClick={() => setDetailLead(l)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" readOnly checked={selected.has(l.id)}
                      onChange={() => toggleSelect(l.id)}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--acc)' }} />
                  </td>
                  <td style={{ fontWeight: 700 }}>{l.student_name ?? <span style={{ color: 'var(--m)', fontStyle: 'italic' }}>—</span>}</td>
                  <td>{l.grade ? <span style={{ fontSize: 11, background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{l.grade}</span> : '—'}</td>
                  <td style={{ fontSize: 12 }}>{l.parent_name ?? '—'}</td>
                  <td>
                    {l.mobile
                      ? <a href={`tel:${l.mobile}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--acc)', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>{l.mobile}</a>
                      : <span style={{ color: 'var(--m)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--m)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.email ?? '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{l.schools?.name ?? '—'}</td>
                  <td><StatusBadge status={l.status} /></td>
                  <td style={{ fontSize: 11, color: 'var(--m)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.notes ?? '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--m)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showImport && (
        <ImportModal
          schools={schools} programs={programs}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadLeads(); }}
          showToast={showToast}
        />
      )}

      {showComms && (
        <BroadcastModal
          leads={displayed.length > 0 ? displayed : leads}
          schools={schools} templates={templates}
          onClose={() => setShowComms(false)}
          showToast={showToast}
        />
      )}

      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onSaved={updated => {
            setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
            setDetailLead(null);
          }}
          showToast={showToast}
          templates={templates}
          schools={schools}
        />
      )}
    </div>
  );
}
