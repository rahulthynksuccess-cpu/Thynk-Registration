'use client';
// components/registration/SchoolRegistrationForm.tsx
// Self-registration form for school officials
// Used by OpenRegistrationPage when mode = 'school'

import { useState, useEffect } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';

const IS: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box' as any,
};
const SS: React.CSSProperties = { ...IS, appearance: 'none' as any };

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  projectSlug?: string;
  projectId?: string;
  onBack: () => void;
  branding?: { primaryColor?: string; accentColor?: string };
}

export default function SchoolRegistrationForm({ projectSlug, projectId, onBack, branding }: Props) {
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg]       = useState('');
  const [formErrors, setFormErrors]   = useState<Record<string, string>>({});

  const [f, setF] = useState({
    name: '', address: '', country: 'India', state: '', city: '', customCity: '',
    pin_code: '', designation: '', contactName: '', contactEmail: '', contactMobile: '',
  });

  // ── Dynamic location data fetched from the DB ──────────────────
  const [countries,     setCountries]     = useState<string[]>([]);
  const [states,        setStates]        = useState<string[]>([]);
  const [cities,        setCities]        = useState<string[]>([]);
  const [locLoading,    setLocLoading]    = useState(true);

  // Fetch countries once on mount
  useEffect(() => {
    fetch(`${BACKEND}/api/admin/location?type=countries`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.countries?.length) setCountries(d.countries);
      })
      .catch(() => {})
      .finally(() => setLocLoading(false));
  }, []);

  // Fetch states when country changes
  useEffect(() => {
    if (!f.country) { setStates([]); setCities([]); return; }
    fetch(`${BACKEND}/api/admin/location?type=states&country=${encodeURIComponent(f.country)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.states) setStates(d.states); else setStates([]); })
      .catch(() => setStates([]));
  }, [f.country]);

  // Fetch cities when state changes
  useEffect(() => {
    if (!f.country || !f.state) { setCities([]); return; }
    fetch(`${BACKEND}/api/admin/location?type=cities&country=${encodeURIComponent(f.country)}&state=${encodeURIComponent(f.state)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.cities) setCities(d.cities); else setCities([]); })
      .catch(() => setCities([]));
  }, [f.country, f.state]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => {
      const val = e.target.value;
      const next: any = { ...p, [k]: val };
      if (k === 'country') { next.state = ''; next.city = ''; next.customCity = ''; }
      if (k === 'state')   { next.city = ''; next.customCity = ''; }
      return next;
    });

  const finalCity = f.city === '__custom' ? f.customCity : f.city;

  const primary = branding?.primaryColor ?? '#4f46e5';
  const accent  = branding?.accentColor  ?? '#8b5cf6';

  function validate() {
    const errs: Record<string, string> = {};
    if (!f.name.trim())          errs.name          = 'School name is required';
    if (!f.address.trim())       errs.address       = 'Address is required';
    if (!f.country)              errs.country       = 'Country is required';
    if (!f.state)                errs.state         = 'State is required';
    if (!finalCity?.trim())      errs.city          = 'City is required';
    if (!f.pin_code.trim())      errs.pin_code      = 'Pin code is required';
    if (!f.contactName.trim())   errs.contactName   = 'Contact name is required';
    if (!f.designation.trim())   errs.designation   = 'Designation is required';
    if (!f.contactMobile.trim()) errs.contactMobile = 'Mobile number is required';
    if (f.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail))
      errs.contactEmail = 'Enter a valid email address';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitState('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${BACKEND}/api/school/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         f.name.trim(),
          address:      f.address.trim(),
          country:      f.country,
          state:        f.state,
          city:         finalCity?.trim(),
          pin_code:     f.pin_code.trim(),
          project_id:   projectId,
          project_slug: projectSlug,
          contact_persons: [{
            name:        f.contactName.trim(),
            designation: f.designation.trim(),
            email:       f.contactEmail.trim() || null,
            mobile:      f.contactMobile.trim(),
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitState('error'); setErrorMsg(data.error || 'Submission failed. Please try again.'); return; }
      setSubmitState('success');
    } catch (err: any) {
      setSubmitState('error');
      setErrorMsg(err.message || 'Network error. Please try again.');
    }
  }

  if (submitState === 'success') {
    return (
      <div className="atg-card" id="atgCard">
        <div className="card-header" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
          <h1>Registration Submitted</h1>
          <p>Thank you for registering your school</p>
        </div>
        <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
            School Registration Received!
          </h2>
          <p style={{ fontSize: 14, color: 'var(--m)', lineHeight: 1.7, marginBottom: 24 }}>
            Your school <strong style={{ color: 'var(--text)' }}>{f.name}</strong> has been registered.
            Our team will review and notify you once approved.
          </p>
          <div style={{ background: `${primary}10`, border: `1.5px solid ${primary}30`, borderRadius: 12, padding: '16px 20px', textAlign: 'left', marginBottom: 24 }}>
            {[['School', f.name], ['City', `${finalCity}, ${f.state}, ${f.country}`], ['Contact', `${f.contactName} (${f.designation})`], ['Mobile', f.contactMobile]].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--m)', minWidth: 72 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="atg-card" id="atgCard">
      <div className="card-header" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
        <h1>School Registration</h1>
        <p>Fill in your school details below</p>
      </div>
      <div className="card-body">
        {/* Warning */}
        <div style={{ background: '#fef3c710', border: '1.5px solid #fbbf2480', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          ⚠️ This form is for School Officials only — not for students.
        </div>

        <div className="field">
          <label className="field-label">School Name *</label>
          <input style={IS} value={f.name} onChange={set('name')} placeholder="Full name of the school" className={formErrors.name ? 'err' : ''} />
          {formErrors.name && <div className="err-msg show">{formErrors.name}</div>}
        </div>

        <div className="field">
          <label className="field-label">Address *</label>
          <textarea style={{ ...IS, height: 72, resize: 'vertical' } as any} value={f.address} onChange={set('address')} placeholder="Full street address" className={formErrors.address ? 'err' : ''} />
          {formErrors.address && <div className="err-msg show">{formErrors.address}</div>}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Country *</label>
            <div className="select-wrap">
              <select style={SS} value={f.country} onChange={set('country')} className={formErrors.country ? 'err' : ''}>
                {locLoading
                  ? <option value="India">India</option>
                  : countries.map(c => <option key={c} value={c}>{c}</option>)
                }
              </select>
            </div>
            {formErrors.country && <div className="err-msg show">{formErrors.country}</div>}
          </div>
          <div className="field">
            <label className="field-label">State / Region *</label>
            <div className="select-wrap">
              <select style={SS} value={f.state} onChange={set('state')} disabled={states.length === 0} className={formErrors.state ? 'err' : ''}>
                <option value="">Select state</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {formErrors.state && <div className="err-msg show">{formErrors.state}</div>}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">City *</label>
            {cities.length > 0 ? (
              <>
                <div className="select-wrap">
                  <select style={SS} value={f.city} onChange={set('city')} className={formErrors.city ? 'err' : ''}>
                    <option value="">Select city</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__custom">+ Add New City</option>
                  </select>
                </div>
                {f.city === '__custom' && (
                  <input style={{ ...IS, marginTop: 8 }} value={f.customCity} onChange={set('customCity')} placeholder="Enter city name" />
                )}
              </>
            ) : (
              <input style={IS} value={f.city} onChange={set('city')} placeholder={f.state ? 'Enter city name' : 'Select state first'} disabled={!f.state} className={formErrors.city ? 'err' : ''} />
            )}
            {formErrors.city && <div className="err-msg show">{formErrors.city}</div>}
          </div>
          <div className="field">
            <label className="field-label">Pin Code *</label>
            <input style={IS} value={f.pin_code} onChange={set('pin_code')} placeholder="e.g. 110001" className={formErrors.pin_code ? 'err' : ''} />
            {formErrors.pin_code && <div className="err-msg show">{formErrors.pin_code}</div>}
          </div>
        </div>

        {/* Contact person */}
        <div style={{ border: '1px solid var(--bd)', borderRadius: 12, padding: 16, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>👤 Contact Person</div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Name *</label>
              <input style={IS} value={f.contactName} onChange={set('contactName')} placeholder="Full name" className={formErrors.contactName ? 'err' : ''} />
              {formErrors.contactName && <div className="err-msg show">{formErrors.contactName}</div>}
            </div>
            <div className="field">
              <label className="field-label">Designation *</label>
              <input style={IS} value={f.designation} onChange={set('designation')} placeholder="Principal / Coordinator" className={formErrors.designation ? 'err' : ''} />
              {formErrors.designation && <div className="err-msg show">{formErrors.designation}</div>}
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Mobile Number *</label>
              <input style={IS} value={f.contactMobile} onChange={set('contactMobile')} placeholder="+91 98765 43210" type="tel" className={formErrors.contactMobile ? 'err' : ''} />
              {formErrors.contactMobile && <div className="err-msg show">{formErrors.contactMobile}</div>}
            </div>
            <div className="field">
              <label className="field-label">Email (optional)</label>
              <input style={IS} value={f.contactEmail} onChange={set('contactEmail')} placeholder="school@example.com" type="email" className={formErrors.contactEmail ? 'err' : ''} />
              {formErrors.contactEmail && <div className="err-msg show">{formErrors.contactEmail}</div>}
            </div>
          </div>
        </div>

        {submitState === 'error' && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 13, color: '#991b1b' }}>
            ❌ {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn-back" onClick={onBack} disabled={submitState === 'loading'}>← Back</button>
          <button
            className="btn-next"
            onClick={handleSubmit}
            disabled={submitState === 'loading'}
            style={{ background: submitState === 'loading' ? 'var(--m)' : `linear-gradient(135deg, ${primary}, ${accent})` }}
          >
            {submitState === 'loading' ? 'Submitting…' : 'Submit School Registration →'}
          </button>
        </div>
      </div>
    </div>
  );
}
