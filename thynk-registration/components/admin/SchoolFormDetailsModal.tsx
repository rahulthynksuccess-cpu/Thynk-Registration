'use client';
// components/admin/SchoolFormDetailsModal.tsx
// Read-only view of the full school registration form data — the same
// fields that were captured when the school was created/submitted
// (web or mobile "Add School" form). Used from both the Approved
// school list and the Pending Approval queue via a "📋 School Details" button.

import React from 'react';

type Row = Record<string, any>;

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtAmount = (paise?: number | null, currency?: string) => {
  if (paise === null || paise === undefined || isNaN(paise)) return '—';
  const sym = (currency || 'INR') === 'INR' ? '₹' : (currency || '') + ' ';
  return `${sym}${(paise / 100).toLocaleString('en-IN')}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
      </div>
      <div style={{ background: 'var(--bg)', border: '1.5px solid var(--bd)', borderRadius: 12, padding: '4px 14px' }}>
        {children}
      </div>
    </div>
  );
}

function Row_({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ fontSize: 12, color: 'var(--m)', flexShrink: 0, minWidth: 130 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </div>
    </div>
  );
}

export default function SchoolFormDetailsModal({ school, programs, onClose }: {
  school: Row;
  programs: Row[];
  onClose: () => void;
}) {
  const program = programs.find(p => p.id === school.project_id) ?? programs.find(p => p.slug === school.project_slug);
  const status  = school.status || 'approved';
  const statusLabel = status === 'approved' ? '✅ Approved' : status === 'pending_approval' ? '⏳ Pending Approval' : '🆕 Registered';

  const contacts: any[] = Array.isArray(school.contact_persons) ? school.contact_persons : [];
  const pricing:  any[] = Array.isArray(school.pricing) ? school.pricing : [];
  const branding: Row   = school.branding && typeof school.branding === 'object' ? school.branding : {};

  const regUrl = program
    ? `https://thynksuccess.com/registration/${school.project_slug ?? program.slug ?? ''}/?school=${school.school_code}`
    : '';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>📋 School Details</h3>
            <div style={{ fontSize: 12, color: 'var(--m)', marginTop: 3 }}>Full form data submitted for {school.name}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 22, lineHeight: 1 }}>&#x2715;</button>
        </div>

        <div style={{ padding: '20px 24px 28px' }}>
          {/* Title strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <code style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '3px 10px', borderRadius: 7, fontSize: 12, fontWeight: 800 }}>{school.school_code || '—'}</code>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{school.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: status === 'approved' ? '#d1fae5' : status === 'pending_approval' ? '#fef3c7' : '#e0e7ff', color: status === 'approved' ? '#065f46' : status === 'pending_approval' ? '#92400e' : '#3730a3' }}>
              {statusLabel}
            </span>
          </div>

          {/* Created date — shown prominently up top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, fontSize: 12, color: 'var(--m)' }}>
            <span>📅</span>
            <span>School created on <strong style={{ color: 'var(--text)' }}>{fmtDate(school.created_at)}</strong></span>
          </div>

          {/* Basic Info */}
          <Section title="🏫 Basic Information">
            <Row_ label="School Name" value={school.name} />
            <Row_ label="Organisation Name" value={school.org_name} />
            <Row_ label="School Code" value={school.school_code} mono />
            <Row_ label="Created On" value={fmtDate(school.created_at)} />
            {school.approved_at && <Row_ label="Approved On" value={fmtDate(school.approved_at)} />}
          </Section>

          {/* Location */}
          <Section title="📍 Location">
            <Row_ label="Address" value={school.address} />
            <Row_ label="Pin Code" value={school.pin_code} />
            <Row_ label="City" value={school.city} />
            <Row_ label="State" value={school.state} />
            <Row_ label="Country" value={school.country} />
          </Section>

          {/* Program & Pricing */}
          <Section title="🎓 Program & Pricing">
            <Row_ label="Program" value={program?.name ?? school.project_slug ?? '—'} />
            {pricing.length > 0 ? (
              pricing.map((p, i) => (
                <Row_ key={p.id ?? i} label={p.program_name || `Pricing #${i + 1}`} value={fmtAmount(p.base_amount, p.currency)} />
              ))
            ) : (
              <Row_ label="School Price" value="—" />
            )}
            <Row_ label="Discount Code" value={school.discount_code?.toUpperCase()} mono />
            {regUrl && (
              <div style={{ padding: '9px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--m)', marginBottom: 4 }}>Registration URL</div>
                <a href={regUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--acc)', wordBreak: 'break-all' }}>{regUrl}</a>
              </div>
            )}
          </Section>

          {/* Contact Persons */}
          <Section title={`👤 Contact Persons ${contacts.length ? `(${contacts.length})` : ''}`}>
            {contacts.length === 0 && <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--m)' }}>No contact persons submitted</div>}
            {contacts.map((c, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < contacts.length - 1 ? '1px solid var(--bd)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.name || '—'}</span>
                  <span style={{ fontSize: 11, color: 'var(--m)' }}>{c.designation || ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 3, flexWrap: 'wrap' }}>
                  {c.mobile && <a href={`tel:${c.mobile}`} style={{ fontSize: 12, color: 'var(--acc)', textDecoration: 'none' }}>📞 {c.mobile}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: 'var(--acc)', textDecoration: 'none' }}>✉️ {c.email}</a>}
                </div>
              </div>
            ))}
          </Section>

          {/* Branding */}
          {(branding.primaryColor || branding.accentColor) && (
            <Section title="🎨 Branding">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ fontSize: 12, color: 'var(--m)' }}>Primary Color</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: branding.primaryColor || '#ccc', border: '1px solid var(--bd)' }} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>{branding.primaryColor || '—'}</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--m)' }}>Accent Color</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: branding.accentColor || '#ccc', border: '1px solid var(--bd)' }} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>{branding.accentColor || '—'}</span>
                </span>
              </div>
            </Section>
          )}

          {/* Settings */}
          <Section title="⚙️ Settings">
            <Row_ label="School Active" value={school.is_active ? '✅ Yes' : '❌ No'} />
            <Row_ label="Registration Open" value={school.is_registration_active ? '🔓 Open' : '🔒 Closed'} />
            {school.consultant_id && <Row_ label="Consultant ID" value={school.consultant_id} mono />}
          </Section>
        </div>
      </div>
    </div>
  );
}
