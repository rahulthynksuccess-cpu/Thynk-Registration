'use client';
// components/registration/RegistrationEntry.tsx
// Step 0: Choose School Registration or Student Registration
// Wraps the existing RegistrationCard for students

import { useState } from 'react';
import type { SchoolWithPricing, Pricing } from '@/lib/types';
import { formatAmount } from '@/lib/utils';
import RegistrationCard from './RegistrationCard';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';

// Location data for dropdowns (country → state → city)
const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  India: {
    'Andhra Pradesh':       ['Visakhapatnam','Vijayawada','Guntur','Tirupati','Nellore'],
    'Delhi':                ['New Delhi','Delhi'],
    'Gujarat':              ['Ahmedabad','Surat','Vadodara','Rajkot','Gandhinagar'],
    'Karnataka':            ['Bengaluru','Mysuru','Hubli','Mangaluru'],
    'Kerala':               ['Kochi','Thiruvananthapuram','Kozhikode','Thrissur'],
    'Madhya Pradesh':       ['Bhopal','Indore','Gwalior','Jabalpur'],
    'Maharashtra':          ['Mumbai','Pune','Nagpur','Nashik','Thane','Aurangabad'],
    'Punjab':               ['Ludhiana','Amritsar','Jalandhar','Chandigarh'],
    'Rajasthan':            ['Jaipur','Jodhpur','Udaipur','Kota'],
    'Tamil Nadu':           ['Chennai','Coimbatore','Madurai','Salem'],
    'Telangana':            ['Hyderabad','Warangal','Karimnagar'],
    'Uttar Pradesh':        ['Lucknow','Kanpur','Agra','Varanasi','Noida','Ghaziabad'],
    'West Bengal':          ['Kolkata','Howrah','Durgapur'],
    'Haryana':              ['Gurugram','Faridabad','Ambala'],
    'Uttarakhand':          ['Dehradun','Haridwar','Roorkee'],
    'Bihar':                ['Patna','Gaya','Muzaffarpur'],
    'Jharkhand':            ['Ranchi','Jamshedpur','Dhanbad'],
    'Odisha':               ['Bhubaneswar','Cuttack','Rourkela'],
    'Assam':                ['Guwahati','Silchar'],
    'Other':                [],
  },
  'United Arab Emirates': {
    'Dubai':      ['Dubai'],
    'Abu Dhabi':  ['Abu Dhabi','Al Ain'],
    'Sharjah':    ['Sharjah'],
    'Ajman':      ['Ajman'],
    'Other':      [],
  },
  'Saudi Arabia': {
    'Riyadh':             ['Riyadh'],
    'Makkah':             ['Jeddah','Mecca'],
    'Eastern Province':   ['Dammam','Khobar'],
    'Other':              [],
  },
  'Kuwait':      { 'Kuwait City': ['Kuwait City'], 'Other': [] },
  'Qatar':       { 'Doha':        ['Doha'],         'Other': [] },
  'Bahrain':     { 'Capital':     ['Manama'],        'Other': [] },
  'Oman':        { 'Muscat':      ['Muscat'],        'Other': [] },
  'Singapore':   { 'Singapore':   ['Singapore'],     'Other': [] },
  'Malaysia':    { 'Kuala Lumpur': ['Kuala Lumpur'], 'Selangor': ['Shah Alam','Petaling Jaya'], 'Other': [] },
  'Nepal':       { 'Bagmati':     ['Kathmandu','Lalitpur'], 'Other': [] },
  'Bangladesh':  { 'Dhaka':       ['Dhaka'],         'Other': [] },
  'Sri Lanka':   { 'Western':     ['Colombo'],       'Other': [] },
  'Other':       { 'Other':       [] },
};

type Mode = 'choose' | 'school' | 'student';

interface Props {
  school: SchoolWithPricing & { public_gateway_config: any; allowed_grades?: string[] };
  pricing: Pricing;
  projectSlug?: string;
  paymentError?: boolean;
  projectId?: string;
}

const IS: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--bd)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--card)',
  boxSizing: 'border-box',
};
const SS: React.CSSProperties = { ...IS, appearance: 'none' as any };

export default function RegistrationEntry({ school, pricing, projectSlug, paymentError, projectId }: Props) {
  const [mode, setMode] = useState<Mode>('choose');

  if (mode === 'student') {
    return (
      <RegistrationCard
        school={school}
        pricing={pricing}
        projectSlug={projectSlug}
        paymentError={paymentError}
      />
    );
  }

  if (mode === 'school') {
    return (
      <SchoolRegistrationForm
        projectId={projectId || school.project_id}
        projectSlug={projectSlug}
        onBack={() => setMode('choose')}
        branding={school.branding}
      />
    );
  }

  // ── Mode: choose ─────────────────────────────────────────────
  return (
    <div className="atg-card" id="atgCard">
      <div
        className="card-header"
        style={{
          background: `linear-gradient(135deg, ${school.branding?.primaryColor ?? '#4f46e5'} 0%, ${school.branding?.accentColor ?? '#8b5cf6'} 100%)`,
        }}
      >
        {school.logo_url && (
          <img src={school.logo_url} alt={school.name} style={{ height: 40, marginBottom: 8 }} />
        )}
        <h1>{school.name}</h1>
        <p>{school.org_name}</p>
      </div>

      <div className="card-body">
        <p style={{ fontSize: 14, color: 'var(--m)', marginBottom: 24, textAlign: 'center' }}>
          Please select your registration type to continue
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* School Registration Card */}
          <button
            onClick={() => setMode('school')}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'block',
              border: '2px solid var(--bd)',
              borderRadius: 16,
              padding: '24px 20px',
              background: 'var(--card)',
              transition: 'border-color .15s, box-shadow .15s',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = school.branding?.primaryColor ?? '#4f46e5';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${school.branding?.primaryColor ?? '#4f46e5'}22`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--bd)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `${school.branding?.primaryColor ?? '#4f46e5'}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                🏫
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'Sora, sans-serif',
                    fontWeight: 800,
                    fontSize: 18,
                    color: 'var(--text)',
                    marginBottom: 6,
                  }}
                >
                  School Registration
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: school.branding?.primaryColor ?? '#4f46e5',
                    background: `${school.branding?.primaryColor ?? '#4f46e5'}12`,
                    border: `1.5px solid ${school.branding?.primaryColor ?? '#4f46e5'}30`,
                    borderRadius: 8,
                    padding: '4px 10px',
                    display: 'inline-block',
                    marginBottom: 8,
                  }}
                >
                  ⚠️ To be filled by School Officials only (Not for students)
                </div>
                <div style={{ fontSize: 13, color: 'var(--m)', lineHeight: 1.5 }}>
                  Register your school to participate. Our team will review and approve your application.
                </div>
              </div>
              <div style={{ fontSize: 22, color: 'var(--m)', flexShrink: 0 }}>→</div>
            </div>
          </button>

          {/* Student Registration Card */}
          <button
            onClick={() => {
              // Block if school is not approved
              if ((school as any).status && (school as any).status !== 'approved') {
                alert('Student registrations for this school are not yet open. Please check back after the school is approved.');
                return;
              }
              setMode('student');
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'block',
              border: '2px solid var(--bd)',
              borderRadius: 16,
              padding: '24px 20px',
              background: 'var(--card)',
              transition: 'border-color .15s, box-shadow .15s',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = '#10b981';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px #10b98122';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--bd)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: '#10b98118',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                🎓
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'Sora, sans-serif',
                    fontWeight: 800,
                    fontSize: 18,
                    color: 'var(--text)',
                    marginBottom: 6,
                  }}
                >
                  Student Registration
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: '#10b981',
                    background: '#10b98112',
                    border: '1.5px solid #10b98130',
                    borderRadius: 8,
                    padding: '4px 10px',
                    display: 'inline-block',
                    marginBottom: 8,
                  }}
                >
                  For student / parent registration only
                </div>
                <div style={{ fontSize: 13, color: 'var(--m)', lineHeight: 1.5 }}>
                  Register as a student for{' '}
                  <strong style={{ color: 'var(--text)' }}>{pricing.program_name}</strong>.
                  Proceed to fill your details and complete payment.
                </div>
              </div>
              <div style={{ fontSize: 22, color: 'var(--m)', flexShrink: 0 }}>→</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── School Self-Registration Form ──────────────────────────────────

interface SchoolFormProps {
  projectId?: string;
  projectSlug?: string;
  onBack: () => void;
  branding: any;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function SchoolRegistrationForm({ projectId, projectSlug, onBack, branding }: SchoolFormProps) {
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg]       = useState('');
  const [formErrors, setFormErrors]   = useState<Record<string, string>>({});

  const [f, setF] = useState({
    name:        '',
    address:     '',
    country:     'India',
    state:       '',
    city:        '',
    customCity:  '',
    pin_code:    '',
    designation: '',
    contactName: '',
    contactEmail:'',
    contactMobile:'',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => {
      const val = e.target.value;
      const next: any = { ...p, [k]: val };
      if (k === 'country') { next.state = ''; next.city = ''; next.customCity = ''; }
      if (k === 'state')   { next.city = ''; next.customCity = ''; }
      return next;
    });

  const countryData = LOCATION_DATA[f.country] ?? LOCATION_DATA['Other'];
  const stateList   = Object.keys(countryData);
  const cityList    = f.state ? (countryData[f.state] ?? []) : [];
  const showAddCity = cityList.length === 0 && f.state;
  const finalCity   = f.city === '__custom' ? f.customCity : f.city;

  function validate() {
    const errs: Record<string, string> = {};
    if (!f.name.trim())          errs.name         = 'School name is required';
    if (!f.address.trim())       errs.address      = 'Address is required';
    if (!f.country)              errs.country      = 'Country is required';
    if (!f.state)                errs.state        = 'State is required';
    if (!finalCity?.trim())      errs.city         = 'City is required';
    if (!f.pin_code.trim())      errs.pin_code     = 'Pin code is required';
    if (!f.contactName.trim())   errs.contactName  = 'Contact person name is required';
    if (!f.designation.trim())   errs.designation  = 'Designation is required';
    if (!f.contactMobile.trim()) errs.contactMobile= 'Mobile number is required';
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
      const res = await fetch(`${BACKEND}/api/schools/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        f.name.trim(),
          address:     f.address.trim(),
          country:     f.country,
          state:       f.state,
          city:        finalCity?.trim(),
          pin_code:    f.pin_code.trim(),
          project_id:  projectId,
          project_slug: projectSlug,
          contact_persons: [
            {
              name:        f.contactName.trim(),
              designation: f.designation.trim(),
              email:       f.contactEmail.trim() || null,
              mobile:      f.contactMobile.trim(),
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitState('error');
        setErrorMsg(data.error || 'Failed to submit registration. Please try again.');
        return;
      }

      setSubmitState('success');
    } catch (err: any) {
      setSubmitState('error');
      setErrorMsg(err.message || 'Network error. Please try again.');
    }
  }

  const primaryColor = branding?.primaryColor ?? '#4f46e5';
  const accentColor  = branding?.accentColor  ?? '#8b5cf6';

  // ── Success screen ─────────────────────────────────────────────
  if (submitState === 'success') {
    return (
      <div className="atg-card" id="atgCard">
        <div
          className="card-header"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }}
        >
          <h1>Registration Submitted</h1>
          <p>Thank you for registering your school</p>
        </div>
        <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2
            style={{
              fontFamily: 'Sora, sans-serif',
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 12,
              color: 'var(--text)',
            }}
          >
            School Registration Received!
          </h2>
          <p style={{ fontSize: 14, color: 'var(--m)', lineHeight: 1.7, marginBottom: 24 }}>
            Your school <strong style={{ color: 'var(--text)' }}>{f.name}</strong> has been
            registered successfully. Our team will review your application and notify you once
            approved. Student registrations will be enabled after approval.
          </p>
          <div
            style={{
              background: `${primaryColor}10`,
              border: `1.5px solid ${primaryColor}30`,
              borderRadius: 12,
              padding: '16px 20px',
              textAlign: 'left',
              marginBottom: 24,
            }}
          >
            {[
              ['School',   f.name],
              ['City',     `${finalCity}, ${f.state}, ${f.country}`],
              ['Contact',  `${f.contactName} (${f.designation})`],
              ['Mobile',   f.contactMobile],
              ['Email',    f.contactEmail || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--m)', minWidth: 72 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--m2)' }}>
            A confirmation will be sent to your contact details once reviewed.
          </p>
        </div>
      </div>
    );
  }

  // ── Registration form ──────────────────────────────────────────
  return (
    <div className="atg-card" id="atgCard">
      <div
        className="card-header"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }}
      >
        <h1>School Registration</h1>
        <p>Fill in your school details below</p>
      </div>

      <div className="card-body">
        {/* Warning banner */}
        <div
          style={{
            background: '#fef3c710',
            border: '1.5px solid #fbbf2480',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            color: '#92400e',
            fontWeight: 600,
          }}
        >
          ⚠️ This form is to be filled by School Officials only — not for students.
        </div>

        {/* School identity */}
        <div className="field">
          <label>School Name *</label>
          <input
            style={IS}
            value={f.name}
            onChange={set('name')}
            placeholder="Full name of the school"
            className={formErrors.name ? 'err' : ''}
          />
          {formErrors.name && <div className="err-msg show">{formErrors.name}</div>}
        </div>

        {/* Address */}
        <div className="field">
          <label>Address *</label>
          <textarea
            style={{ ...IS, height: 72, resize: 'vertical' }}
            value={f.address}
            onChange={set('address')}
            placeholder="Full street address of the school"
            className={formErrors.address ? 'err' : ''}
          />
          {formErrors.address && <div className="err-msg show">{formErrors.address}</div>}
        </div>

        {/* Location row 1: Country + State */}
        <div className="field-row">
          <div className="field">
            <label>Country *</label>
            <select style={SS} value={f.country} onChange={set('country')} className={formErrors.country ? 'err' : ''}>
              {Object.keys(LOCATION_DATA).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {formErrors.country && <div className="err-msg show">{formErrors.country}</div>}
          </div>

          <div className="field">
            <label>State / Region *</label>
            <select
              style={SS}
              value={f.state}
              onChange={set('state')}
              disabled={stateList.length === 0}
              className={formErrors.state ? 'err' : ''}
            >
              <option value="">Select state</option>
              {stateList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {formErrors.state && <div className="err-msg show">{formErrors.state}</div>}
          </div>
        </div>

        {/* Location row 2: City + Pin Code */}
        <div className="field-row">
          <div className="field">
            <label>City *</label>
            {cityList.length > 0 ? (
              <>
                <select
                  style={SS}
                  value={f.city}
                  onChange={set('city')}
                  className={formErrors.city ? 'err' : ''}
                >
                  <option value="">Select city</option>
                  {cityList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__custom">+ Add New City</option>
                </select>
                {f.city === '__custom' && (
                  <input
                    style={{ ...IS, marginTop: 8 }}
                    value={f.customCity}
                    onChange={set('customCity')}
                    placeholder="Enter city name"
                  />
                )}
              </>
            ) : (
              <input
                style={IS}
                value={f.city}
                onChange={set('city')}
                placeholder={f.state ? 'Enter city name' : 'Select state first'}
                disabled={!f.state}
                className={formErrors.city ? 'err' : ''}
              />
            )}
            {formErrors.city && <div className="err-msg show">{formErrors.city}</div>}
          </div>

          <div className="field">
            <label>Pin Code *</label>
            <input
              style={IS}
              value={f.pin_code}
              onChange={set('pin_code')}
              placeholder="e.g. 110001"
              className={formErrors.pin_code ? 'err' : ''}
            />
            {formErrors.pin_code && <div className="err-msg show">{formErrors.pin_code}</div>}
          </div>
        </div>

        {/* Contact person */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--bd)',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--m)',
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              marginBottom: 14,
            }}
          >
            👤 Contact Person Details
          </div>

          <div className="field-row">
            <div className="field">
              <label>Contact Person Name *</label>
              <input
                style={IS}
                value={f.contactName}
                onChange={set('contactName')}
                placeholder="Full name"
                className={formErrors.contactName ? 'err' : ''}
              />
              {formErrors.contactName && <div className="err-msg show">{formErrors.contactName}</div>}
            </div>

            <div className="field">
              <label>Designation *</label>
              <input
                style={IS}
                value={f.designation}
                onChange={set('designation')}
                placeholder="e.g. Principal / Coordinator"
                className={formErrors.designation ? 'err' : ''}
              />
              {formErrors.designation && <div className="err-msg show">{formErrors.designation}</div>}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Mobile Number *</label>
              <input
                style={IS}
                value={f.contactMobile}
                onChange={set('contactMobile')}
                placeholder="+91 98765 43210"
                type="tel"
                inputMode="tel"
                className={formErrors.contactMobile ? 'err' : ''}
              />
              {formErrors.contactMobile && <div className="err-msg show">{formErrors.contactMobile}</div>}
            </div>

            <div className="field">
              <label>Contact Email (optional)</label>
              <input
                style={IS}
                value={f.contactEmail}
                onChange={set('contactEmail')}
                placeholder="school@example.com"
                type="email"
                className={formErrors.contactEmail ? 'err' : ''}
              />
              {formErrors.contactEmail && <div className="err-msg show">{formErrors.contactEmail}</div>}
            </div>
          </div>
        </div>

        {submitState === 'error' && (
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #fca5a5',
              borderRadius: 10,
              padding: '12px 16px',
              marginTop: 16,
              fontSize: 13,
              color: '#991b1b',
            }}
          >
            ❌ {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn-back" onClick={onBack} disabled={submitState === 'loading'}>
            ← Back
          </button>
          <button
            className="btn-next"
            onClick={handleSubmit}
            disabled={submitState === 'loading'}
            style={{
              background:
                submitState === 'loading'
                  ? 'var(--m)'
                  : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
            }}
          >
            {submitState === 'loading' ? 'Submitting…' : 'Submit School Registration →'}
          </button>
        </div>
      </div>
    </div>
  );
}
