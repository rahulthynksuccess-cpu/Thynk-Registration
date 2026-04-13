'use client';
import React, { useState, useEffect } from 'react';
import AdminApprovalQueue from '@/components/admin/AdminApprovalQueue';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

// ── School Detail Modal ──────────────────────────────────────────────────────
function SchoolDetailModal({
  school,
  onClose,
  showToast,
}: {
  school: Row;
  onClose: () => void;
  showToast: (t: string, i?: string) => void;
}) {
  const [templates,   setTemplates]   = useState<Row[]>([]);
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email' | null>(null);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [toPhone,     setToPhone]     = useState(school.contact_phone ?? '');
  const [toEmail,     setToEmail]     = useState(school.contact_email ?? '');
  const [sending,     setSending]     = useState(false);
  const [preview,     setPreview]     = useState('');

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/templates`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTemplates((d?.templates ?? []).filter((t: Row) => t.is_active)))
      .catch(() => {});
  }, []);

  const channelTemplates = templates.filter(t => t.channel === sendChannel);

  // Auto-preview when template selected
  useEffect(() => {
    if (!selectedTpl) { setPreview(''); return; }
    const tpl = templates.find(t => t.id === selectedTpl);
    if (!tpl) return;
    const vars: Record<string, string> = {
      school_name:  school.name ?? '',
      school_code:  school.school_code ?? '',
      contact_name: school.contact_name ?? school.name ?? '',
      city:         school.city ?? '',
      country:      school.country ?? '',
      program_name: school.program_name ?? '',
    };
    const rendered = tpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`);
    setPreview(rendered);
  }, [selectedTpl, templates, school]);

  async function handleSend() {
    if (!sendChannel || !selectedTpl) return;
    setSending(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel:     sendChannel,
          template_id: selectedTpl,
          school_id:   school.id,
          to_phone:    toPhone,
          to_email:    toEmail,
          vars: {
            school_name:  school.name ?? '',
            school_code:  school.school_code ?? '',
            contact_name: school.contact_name ?? school.name ?? '',
            city:         school.city ?? '',
            country:      school.country ?? '',
            program_name: school.program_name ?? '',
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ ${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'} sent via ${data.provider}!`, '✅');
        setSendChannel(null);
        setSelectedTpl('');
      } else {
        showToast(`❌ Send failed: ${data.error}`, '❌');
      }
    } catch (e: any) {
      showToast(`❌ Send failed: ${e.message}`, '❌');
    }
    setSending(false);
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
    padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
    outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em',
  };

  const rows: [string, React.ReactNode][] = [
    ['Code',     <code key="c" style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{school.school_code}</code>],
    ['School',   <strong key="n">{school.name}</strong>],
    ['Org',      school.org_name && school.org_name !== school.name ? school.org_name : '—'],
    ['Program',  school.program_name ?? school.project_slug ?? '—'],
    ['Location', [school.city, school.state, school.country].filter(Boolean).join(', ') || '—'],
    ['Contact',  school.contact_name ?? '—'],
    ['Phone',    school.contact_phone
      ? <a key="p" href={`tel:${school.contact_phone}`} style={{ color: 'var(--acc)', fontWeight: 600 }}>{school.contact_phone}</a>
      : '—'],
    ['Email',    school.contact_email
      ? <a key="e" href={`mailto:${school.contact_email}`} style={{ color: 'var(--acc)', fontSize: 12 }}>{school.contact_email}</a>
      : '—'],
    ['Status',   <span key="s" className={`badge ${school.is_active ? 'badge-paid' : 'badge-cancelled'}`}>{school.is_active ? 'Active' : 'Inactive'}</span>],
    ['Reg Open', <span key="r" className={`badge ${school.is_registration_active ? 'badge-paid' : 'badge-cancelled'}`}>{school.is_registration_active ? 'Open' : 'Closed'}</span>],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{school.name}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '0 24px' }}>
          {rows.map(([l, v]) => (
            <div key={String(l)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ fontSize: 13, color: 'var(--m)', fontFamily: 'DM Sans,sans-serif', flexShrink: 0, minWidth: 90 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', textAlign: 'right' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Send panel — shown when a channel is selected */}
        {sendChannel && (
          <div style={{ margin: '16px 24px', padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1.5px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {sendChannel === 'whatsapp' ? '💬 Send WhatsApp' : '✉️ Send Email'}
            </div>

            <div>
              <label style={lbl}>{sendChannel === 'whatsapp' ? 'Phone Number' : 'Email Address'}</label>
              {sendChannel === 'whatsapp'
                ? <input style={inp} value={toPhone} onChange={e => setToPhone(e.target.value)} placeholder="91XXXXXXXXXX" />
                : <input style={inp} value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="contact@school.com" />
              }
            </div>

            <div>
              <label style={lbl}>Select Template *</label>
              <select style={{ ...inp, cursor: 'pointer', appearance: 'none' as any }} value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}>
                <option value="">— Choose a template —</option>
                {channelTemplates.length === 0
                  ? <option disabled>No active {sendChannel} templates found</option>
                  : channelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
            </div>

            {preview && (
              <div style={{ background: sendChannel === 'whatsapp' ? 'rgba(26,184,168,.07)' : 'rgba(79,70,229,.07)', borderRadius: 9, padding: '10px 14px', border: `1px solid ${sendChannel === 'whatsapp' ? 'rgba(26,184,168,.25)' : 'rgba(79,70,229,.2)'}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Preview</div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{preview}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setSendChannel(null); setSelectedTpl(''); setPreview(''); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--bd)', background: 'var(--card)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--m)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !selectedTpl || (sendChannel === 'whatsapp' ? !toPhone : !toEmail)}
                style={{ flex: 2, padding: '9px 0', borderRadius: 9, background: sendChannel === 'whatsapp' ? '#1ab8a8' : 'var(--acc)', border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', opacity: (sending || !selectedTpl) ? 0.6 : 1 }}
              >
                {sending ? '⏳ Sending…' : `Send ${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!sendChannel && (
          <div style={{ display: 'flex', gap: 10, padding: '16px 24px 20px' }}>
            <button
              onClick={() => { setSendChannel('whatsapp'); setToPhone(school.contact_phone ?? ''); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(26,184,168,.35)', background: 'rgba(26,184,168,.08)', color: '#0e8a7d', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              💬 WhatsApp
            </button>
            <a
              href={`tel:${school.contact_phone}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.06)', color: '#dc2626', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >
              📞 Call
            </a>
            <button
              onClick={() => { setSendChannel('email'); setToEmail(school.contact_email ?? ''); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.07)', color: '#b45309', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              ✉️ Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const SS: React.CSSProperties = {
  border: '1.5px solid var(--bd)',
  borderRadius: 10,
  padding: '7px 14px',
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--card)',
  cursor: 'pointer',
  appearance: 'none' as any,
};

export function SchoolsPageWithApproval({
  schools,
  programs,
  isSuperAdmin,
  BACKEND,
  authHeaders,
  onEdit,
  onRefresh,
  showToast,
}: {
  schools:      Row[];
  programs:     Row[];
  isSuperAdmin: boolean;
  BACKEND:      string;
  authHeaders:  () => HeadersInit;
  onEdit:       (s: Row) => void;
  onRefresh:    () => void;
  showToast:    (t: string, i?: string) => void;
}) {
  const [tab, setTab] = useState<'queue' | 'approved'>('queue');
  const [schoolModal, setSchoolModal] = useState<Row | null>(null);

  const pendingSchools  = schools.filter(s => s.status && s.status !== 'approved');
  const approvedSchools = schools.filter(s => s.status === 'approved' || !s.status);

  const TAB: (active: boolean) => React.CSSProperties = active => ({
    padding: '8px 18px',
    borderRadius: 10,
    border: '1.5px solid',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background:  active ? 'var(--acc)' : 'transparent',
    borderColor: active ? 'var(--acc)' : 'var(--bd)',
    color:       active ? '#fff'       : 'var(--m)',
    transition:  'all .12s',
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Schools <span>Management</span></h1>
          <p>
            {pendingSchools.length > 0 && (
              <span style={{ color: '#f59e0b', fontWeight: 700, marginRight: 12 }}>
                ⚠️ {pendingSchools.length} pending approval
              </span>
            )}
            {approvedSchools.length} approved school{approvedSchools.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="topbar-right">
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={TAB(tab === 'queue')} onClick={() => setTab('queue')}>
              {pendingSchools.length > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 20,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px',
                  marginRight: 6, display: 'inline-block',
                }}>
                  {pendingSchools.length}
                </span>
              )}
              Approval Queue
            </button>
            <button style={TAB(tab === 'approved')} onClick={() => setTab('approved')}>
              Approved Schools
            </button>
          </div>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => onEdit({})}>
              + Add School
            </button>
          )}
        </div>
      </div>

      {tab === 'queue' && (
        <AdminApprovalQueue
          pendingSchools={pendingSchools}
          programs={programs}
          BACKEND={BACKEND}
          authHeaders={authHeaders}
          onRefresh={onRefresh}
          showToast={showToast}
        />
      )}

      {tab === 'approved' && (
        <SchoolsTableWithStatus
          schools={approvedSchools}
          programs={programs}
          isSuperAdmin={isSuperAdmin}
          onEdit={onEdit}
          onRowClick={s => {
            const prog = programs.find((p: Row) => p.id === s.project_id) ?? programs.find((p: Row) => p.slug === s.project_slug);
            setSchoolModal({ ...s, program_name: prog?.name ?? s.project_slug ?? '' });
          }}
        />
      )}

      {schoolModal && (
        <SchoolDetailModal
          school={schoolModal}
          onClose={() => setSchoolModal(null)}
          showToast={showToast}
        />
      )}
    </>
  );
}

export function SchoolsTableWithStatus({
  schools,
  programs,
  isSuperAdmin,
  onEdit,
  onRowClick,
}: {
  schools:      Row[];
  programs:     Row[];
  isSuperAdmin: boolean;
  onEdit:       (s: Row) => void;
  onRowClick?:  (s: Row) => void;
}) {
  const [filterProgram, setFilterProgram] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState,   setFilterState]   = useState('');
  const [filterCity,    setFilterCity]    = useState('');

  const fmtR = (p: number) => {
    const v = p / 100;
    return isNaN(v) ? '0' : v.toLocaleString('en-IN');
  };

  const countries = [...new Set(schools.map(s => s.country).filter(Boolean))].sort();
  const states    = [...new Set(
    schools
      .filter(s => !filterCountry || s.country === filterCountry)
      .map(s => s.state).filter(Boolean)
  )].sort();
  const cities    = [...new Set(
    schools
      .filter(s => (!filterCountry || s.country === filterCountry) && (!filterState || s.state === filterState))
      .map(s => s.city).filter(Boolean)
  )].sort();

  const filtered = schools.filter(s => {
    const prog = programs.find(p => p.id === s.project_id) ?? programs.find(p => p.slug === s.project_slug);
    if (filterProgram && prog?.id !== filterProgram) return false;
    if (filterCountry && s.country !== filterCountry) return false;
    if (filterState   && s.state   !== filterState)   return false;
    if (filterCity    && s.city    !== filterCity)     return false;
    return true;
  });

  return (
    <>
      <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select style={{ ...SS, width: 'auto', minWidth: 140 }} value={filterProgram} onChange={e => setFilterProgram(e.target.value)}>
          <option value="">All Programs</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 130 }} value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setFilterState(''); setFilterCity(''); }}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 130 }} value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); }}>
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 120 }} value={filterCity} onChange={e => setFilterCity(e.target.value)}>
          <option value="">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--m)', marginLeft: 'auto' }}>
          {filtered.length} of {schools.length}
        </span>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>School Name</th>
              <th>Location</th>
              <th>Program</th>
              <th>Price</th>
              <th>Discount Code</th>
              <th>Registration URL</th>
              <th>Reg Active</th>
              <th>Status</th>
              {isSuperAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="table-empty">No schools match the selected filters.</td></tr>
            ) : (
              filtered.map(s => {
                const prog         = programs.find(p => p.id === s.project_id) ?? programs.find(p => p.slug === s.project_slug);
                const regUrl       = `${prog?.base_url || 'https://www.thynksuccess.com'}/registration/${s.project_slug ?? ''}/?school=${s.school_code}`;
                const schoolCurr   = s.pricing?.[0]?.currency ?? 'INR';
                const priceFmt     = schoolCurr === 'USD'
                  ? `$${fmtR(s.pricing?.[0]?.base_amount ?? 0)}`
                  : `₹${fmtR(s.pricing?.[0]?.base_amount ?? 0)}`;
                const status       = s.status || 'approved';
                const statusClass  = status === 'approved' ? 'badge-paid' : status === 'pending_approval' ? 'badge-initiated' : 'badge-pending';
                const statusLabel  = status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Pending' : 'Registered';

                return (
                  <tr
                    key={s.id}
                    onClick={() => onRowClick?.(s)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    <td>
                      <code style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                        {s.school_code}
                      </code>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {s.name}
                      {s.org_name && s.org_name !== s.name && (
                        <div style={{ fontSize: 11, color: 'var(--m)', fontWeight: 400 }}>{s.org_name}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{prog?.name ?? s.project_slug ?? '—'}</td>
                    <td><span className="amt">{priceFmt}</span></td>
                    <td>
                      <code style={{ background: 'var(--orange2)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                        {s.discount_code || s.school_code?.toUpperCase()}
                      </code>
                    </td>
                    <td>
                      <a href={regUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', fontSize: 11, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        🔗 {regUrl.replace('https://', '').slice(0, 40)}
                      </a>
                    </td>
                    <td>
                      <span className={`badge ${s.is_registration_active ? 'badge-paid' : 'badge-cancelled'}`}>
                        {s.is_registration_active ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{statusLabel}</span>
                    </td>
                    {isSuperAdmin && (
                      <td>
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={e => { e.stopPropagation(); onEdit(s); }}>
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
