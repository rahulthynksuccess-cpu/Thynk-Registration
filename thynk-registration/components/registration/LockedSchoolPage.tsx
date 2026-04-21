'use client';
// components/registration/LockedSchoolPage.tsx
// Used by /registration/[projectSlug]/[schoolCode]
// School is loaded from URL code — Country/State/City/School are pre-filled and locked.
// User only fills: student name, grade, gender, parent name, phone, email → payment

import { useState, useEffect } from 'react';
import PaymentStep from './PaymentStep';
import type { Pricing } from '@/lib/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';

const SS: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)',
  appearance: 'none' as any, boxSizing: 'border-box' as any,
};
const IS: React.CSSProperties = { ...SS, appearance: undefined };

interface SchoolData {
  id: string;
  name: string;
  org_name: string;
  city: string;
  state: string;
  country: string;
  school_code: string;
  status?: string;
  is_registration_active?: boolean;
  branding?: any;
  allowed_grades?: string[];
  pricing: Pricing[];
}

type PageStep = 'loading' | 'blocked' | 'details' | 'payment' | 'success';

function isIndianCountry(country: string): boolean {
  return !country || country.toLowerCase() === 'india';
}

export default function LockedSchoolPage({
  projectSlug,
  schoolCode,
  paymentError,
}: {
  projectSlug: string;
  schoolCode: string;
  paymentError?: boolean;
}) {
  const [pageStep, setPageStep] = useState<PageStep>('loading');
  const [school, setSchool]     = useState<SchoolData | null>(null);
  const [pricing, setPricing]   = useState<Pricing | null>(null);
  const [gradeOptions, setGradeOptions] = useState<string[]>([]);
  const [isIndia, setIsIndia]   = useState(true);
  const [loadError, setLoadError] = useState('');

  // Read pre-fill params from URL (?prefill=1&name=...&phone=...&email=...&class=...&gender=...&parent=...)
  // These are added by the admin "Pay Link" feature so returning students skip straight to payment.
  const prefillParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;
  const isPrefill = prefillParams?.get('prefill') === '1';

  const [fd, setFd] = useState<Record<string, string>>({
    studentName:  isPrefill ? (prefillParams?.get('name')   ?? '') : '',
    classGrade:   isPrefill ? (prefillParams?.get('class')  ?? '') : '',
    gender:       isPrefill ? (prefillParams?.get('gender') ?? '') : '',
    parentName:   isPrefill ? (prefillParams?.get('parent') ?? '') : '',
    contactPhone: isPrefill ? (prefillParams?.get('phone')  ?? '') : '',
    contactEmail: isPrefill ? (prefillParams?.get('email')  ?? '') : '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Load school from API
  useEffect(() => {
    setPageStep('loading');
    fetch(`${BACKEND}/api/school/${schoolCode.toLowerCase()}`)
      .then(r => r.json())
      .then(data => {
        // API returns school fields directly (not nested under data.school)
        if (!data || data.error) {
          setLoadError(data?.error || 'School not found.');
          setPageStep('blocked');
          return;
        }

        const s: SchoolData = {
          id:                   data.id,
          name:                 data.name,
          org_name:             data.org_name || '',
          city:                 data.city || '',
          state:                data.state || '',
          country:              data.country || '',
          school_code:          data.school_code || schoolCode,
          status:               data.status,
          is_registration_active: data.is_registration_active,
          branding:             data.branding,
          allowed_grades:       data.allowed_grades || [],
          pricing:              data.pricing || [],
        };

        setSchool(s);
        setIsIndia(isIndianCountry(s.country));

        const activePricing = (s.pricing || []).find(p => p.is_active) ?? s.pricing?.[0] ?? null;
        setPricing(activePricing);

        if (s.status && s.status !== 'approved') {
          setPageStep('blocked');
          setLoadError(
            s.status === 'registered'
              ? 'This school has been registered but is pending admin approval.'
              : 'Registration is not currently active for this school.'
          );
          return;
        }

        // If admin sent a pre-fill link, skip the details form and go straight to payment
        // (only if all required fields are present)
        if (isPrefill) {
          const p = prefillParams!;
          const hasAll = p.get('name') && p.get('phone') && p.get('email') && p.get('class') && p.get('gender');
          if (hasAll) {
            setPageStep('payment');
            return;
          }
        }

        setPageStep('details');
      })
      .catch(() => {
        setLoadError('Could not load school data. Please try again.');
        setPageStep('blocked');
      });
  }, [schoolCode]);

  // Load grades
  useEffect(() => {
    if (!school) return;
    // Use school's allowed_grades first
    if (school.allowed_grades && school.allowed_grades.length > 0) {
      setGradeOptions(school.allowed_grades);
      return;
    }
    // Fall back to project grades
    fetch(`${BACKEND}/api/grades?project=${encodeURIComponent(projectSlug)}`)
      .then(r => r.json())
      .then(d => setGradeOptions(d.grades ?? []))
      .catch(() => setGradeOptions([]));
  }, [school, projectSlug]);

  const DEFAULT_GRADES = ['Nursery','KG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
    'Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
  const grades = gradeOptions.length ? gradeOptions : DEFAULT_GRADES;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFd(p => ({ ...p, [k]: e.target.value }));

  function validateDetails() {
    const errs: Record<string, string> = {};
    if (!fd.studentName.trim()) errs.studentName = 'Enter student name';
    if (!fd.classGrade)         errs.classGrade  = 'Select a grade';
    if (!fd.gender)             errs.gender      = 'Select gender';
    if (!fd.parentName.trim())  errs.parentName  = 'Enter parent name';
    if (!fd.contactPhone.trim()) errs.contactPhone = 'Enter mobile number';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.contactEmail.trim()))
      errs.contactEmail = 'Enter a valid email';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Loading ───────────────────────────────────────────────────
  if (pageStep === 'loading') {
    return (
      <div className="atg-card" id="atgCard">
        <div className="card-header"><h1>Loading…</h1></div>
        <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loader-spinner" style={{ margin: '0 auto' }} />
          <p style={{ color: 'var(--m)', marginTop: 16 }}>Loading school details…</p>
        </div>
      </div>
    );
  }

  // ── Blocked / error ───────────────────────────────────────────
  if (pageStep === 'blocked') {
    return (
      <div className="atg-card" id="atgCard">
        <div className="card-header"><h1>{school?.name || 'Registration'}</h1></div>
        <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
            Registration Not Available
          </h2>
          <p style={{ color: 'var(--m)', fontSize: 13, lineHeight: 1.6 }}>
            {loadError || 'Student registration is not available for this school at this time.'}
          </p>
          <p style={{ color: 'var(--m2)', fontSize: 12, marginTop: 12 }}>
            Please contact your school coordinator for assistance.
          </p>
        </div>
      </div>
    );
  }

  // ── Payment step ──────────────────────────────────────────────
  if (pageStep === 'payment' && school && pricing) {
    return (
      <PaymentStep
        school={school as any}
        pricing={pricing}
        formData={{
          studentName:  fd.studentName,
          classGrade:   fd.classGrade,
          gender:       fd.gender,
          parentSchool: school.name,
          city:         school.city,
          parentName:   fd.parentName,
          contactPhone: fd.contactPhone,
          contactEmail: fd.contactEmail,
        }}
        isIndia={isIndia}
        paymentError={paymentError}
        ppClientId={(school as any).public_gateway_config?.pp_client_id ?? null}
        onBack={() => setPageStep('details')}
        onSuccess={() => setPageStep('success')}
      />
    );
  }

  // ── Success ───────────────────────────────────────────────────
  if (pageStep === 'success') {
    return (
      <LockedSuccessScreen redirectURL={school?.branding?.redirectURL} />
    );
  }

  // ── Details form ──────────────────────────────────────────────
  return (
    <div className="atg-card" id="atgCard">
      <div
        className="card-header"
        style={{
          background: school?.branding?.primaryColor
            ? `linear-gradient(135deg, ${school.branding.primaryColor}, ${school.branding.accentColor ?? '#8b5cf6'})`
            : undefined,
        }}
      >
        <h1>{school?.name || 'Student Registration'}</h1>
        {school?.org_name && <p>{school.org_name}</p>}
      </div>

      <div className="card-body">
        <StepBar step={1} />

        {/* Locked school info — read only */}
        <div style={{
          background: 'var(--acc3)', border: '1.5px solid rgba(79,70,229,.2)',
          borderRadius: 14, padding: '16px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            📍 Registered School
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {[
              ['School',  school?.name],
              ['City',    school?.city],
              ['State',   school?.state],
              ['Country', school?.country],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--m)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'rgba(255,255,255,.6)', borderRadius: 8, padding: '6px 10px' }}>
                  {value || '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--acc)', fontWeight: 600 }}>
            🔒 School details are pre-filled and cannot be changed
          </div>
        </div>

        {paymentError && (
          <div style={{ background: 'var(--red2)', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
            ⚠️ Your previous payment was cancelled or failed. Please try again.
          </div>
        )}

        <div className="form-section-title">🎓 Student Information</div>
        <div className="form-section-sub">Please fill in all details carefully.</div>

        <div className="field">
          <label className="field-label">Student Name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input style={IS} value={fd.studentName} onChange={set('studentName')} placeholder="Full name of student" className={formErrors.studentName ? 'err' : ''} />
          {formErrors.studentName && <div className="err-msg show">{formErrors.studentName}</div>}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Class / Grade <span style={{ color: 'var(--red)' }}>*</span></label>
            <div className="select-wrap">
              <select style={SS} value={fd.classGrade} onChange={set('classGrade')} className={formErrors.classGrade ? 'err' : ''}>
                <option value="">Select grade</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {formErrors.classGrade && <div className="err-msg show">{formErrors.classGrade}</div>}
          </div>
          <div className="field">
            <label className="field-label">Gender <span style={{ color: 'var(--red)' }}>*</span></label>
            <div className="select-wrap">
              <select style={SS} value={fd.gender} onChange={set('gender')} className={formErrors.gender ? 'err' : ''}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            {formErrors.gender && <div className="err-msg show">{formErrors.gender}</div>}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Parent / Guardian Name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input style={IS} value={fd.parentName} onChange={set('parentName')} placeholder="Full name of parent or guardian" className={formErrors.parentName ? 'err' : ''} />
          {formErrors.parentName && <div className="err-msg show">{formErrors.parentName}</div>}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Mobile Number <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={IS} value={fd.contactPhone} onChange={set('contactPhone')} placeholder="Mobile number" type="tel" className={formErrors.contactPhone ? 'err' : ''} />
            {formErrors.contactPhone && <div className="err-msg show">{formErrors.contactPhone}</div>}
          </div>
          <div className="field">
            <label className="field-label">Email Address <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={IS} value={fd.contactEmail} onChange={set('contactEmail')} placeholder="email@example.com" type="email" className={formErrors.contactEmail ? 'err' : ''} />
            {formErrors.contactEmail && <div className="err-msg show">{formErrors.contactEmail}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn-next" style={{ flex: 1 }} onClick={() => { if (validateDetails()) setPageStep('payment'); }}>
            Continue to Payment →
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="steps" style={{ marginBottom: 28 }}>
      {[1, 2, 3].map((n, i) => (
        <div key={n} style={{ display: 'contents' }}>
          <div className={`step-dot${step === n ? ' active' : step > n ? ' done' : ''}`}>
            {step > n ? '✓' : n}
          </div>
          {i < 2 && <div className={`step-line${step > n ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

function LockedSuccessScreen({ redirectURL }: { redirectURL?: string }) {
  useEffect(() => {
    // Always redirect to homepage — branding.redirectURL points to Next.js routes
    // that don't exist on WordPress (where this form is embedded).
    const url = 'https://www.thynksuccess.com';
    const t = setTimeout(() => {
      try { (window.top as Window).location.href = url; } catch { window.location.href = url; }
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="atg-card" id="atgCard">
      <div className="card-header"><h1>Registration Confirmed!</h1></div>
      <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          You&apos;re Registered!
        </h2>
        <p style={{ color: 'var(--m)', fontSize: 13, lineHeight: 1.6 }}>
          A confirmation email will be sent shortly.<br />
          Redirecting to thynksuccess.com in 5 seconds…
        </p>
      </div>
    </div>
  );
}
