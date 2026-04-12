'use client';
// components/registration/OpenRegistrationPage.tsx
// Used by /registration/[projectSlug]
//
// Flow:
//   1. Mode chooser  →  School Registration  OR  Student Registration
//   2a. School Registration → SchoolRegistrationForm (self-register school)
//   2b. Student Registration → Country → State → City → School picker → student details → payment

import { useState, useEffect, useCallback } from 'react';
import PaymentStep from './PaymentStep';
import SchoolRegistrationForm from './SchoolRegistrationForm';
import type { Pricing } from '@/lib/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://thynk-registration.vercel.app';

// ── Embedded location data (no API call needed) ───────────────────
const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  India: {
    'Andhra Pradesh':  ['Visakhapatnam','Vijayawada','Guntur','Tirupati','Nellore'],
    'Assam':           ['Guwahati','Silchar'],
    'Bihar':           ['Patna','Gaya','Muzaffarpur'],
    'Chandigarh':      ['Chandigarh'],
    'Chhattisgarh':    ['Raipur','Bhilai','Bilaspur'],
    'Delhi':           ['New Delhi','Delhi'],
    'Goa':             ['Panaji','Margao'],
    'Gujarat':         ['Ahmedabad','Surat','Vadodara','Rajkot','Gandhinagar'],
    'Haryana':         ['Gurugram','Faridabad','Ambala','Hisar','Karnal'],
    'Himachal Pradesh':['Shimla','Dharamshala','Manali'],
    'Jammu & Kashmir': ['Srinagar','Jammu'],
    'Jharkhand':       ['Ranchi','Jamshedpur','Dhanbad'],
    'Karnataka':       ['Bengaluru','Mysuru','Hubli','Mangaluru','Belagavi'],
    'Kerala':          ['Kochi','Thiruvananthapuram','Kozhikode','Thrissur'],
    'Madhya Pradesh':  ['Bhopal','Indore','Gwalior','Jabalpur'],
    'Maharashtra':     ['Mumbai','Pune','Nagpur','Nashik','Thane','Aurangabad'],
    'Manipur':         ['Imphal'],
    'Meghalaya':       ['Shillong'],
    'Mizoram':         ['Aizawl'],
    'Nagaland':        ['Kohima','Dimapur'],
    'Odisha':          ['Bhubaneswar','Cuttack','Rourkela'],
    'Puducherry':      ['Puducherry'],
    'Punjab':          ['Ludhiana','Amritsar','Jalandhar','Chandigarh','Mohali'],
    'Rajasthan':       ['Jaipur','Jodhpur','Udaipur','Kota','Ajmer'],
    'Sikkim':          ['Gangtok'],
    'Tamil Nadu':      ['Chennai','Coimbatore','Madurai','Salem','Tiruchirappalli'],
    'Telangana':       ['Hyderabad','Warangal','Karimnagar'],
    'Tripura':         ['Agartala'],
    'Uttar Pradesh':   ['Lucknow','Kanpur','Agra','Varanasi','Noida','Ghaziabad','Meerut','Prayagraj'],
    'Uttarakhand':     ['Dehradun','Haridwar','Roorkee'],
    'West Bengal':     ['Kolkata','Howrah','Durgapur','Siliguri'],
    'Other':           [],
  },
  'United Arab Emirates': {
    'Dubai':     ['Dubai'],
    'Abu Dhabi': ['Abu Dhabi','Al Ain'],
    'Sharjah':   ['Sharjah'],
    'Other':     [],
  },
  'Saudi Arabia': {
    'Riyadh':           ['Riyadh'],
    'Makkah':           ['Jeddah','Mecca'],
    'Eastern Province': ['Dammam','Khobar'],
    'Other':            [],
  },
  'Kuwait':    { 'Kuwait City':  ['Kuwait City'],  'Other': [] },
  'Qatar':     { 'Doha':         ['Doha'],          'Other': [] },
  'Bahrain':   { 'Capital':      ['Manama'],         'Other': [] },
  'Oman':      { 'Muscat':       ['Muscat'],         'Other': [] },
  'Singapore': { 'Singapore':    ['Singapore'],      'Other': [] },
  'Malaysia':  { 'Kuala Lumpur': ['Kuala Lumpur'],   'Other': [] },
  'Nepal':     { 'Bagmati':      ['Kathmandu'],       'Other': [] },
  'Bangladesh':{ 'Dhaka':        ['Dhaka'],           'Other': [] },
  'Other':     { 'Other':        [] },
};

type Mode = 'choose' | 'school' | 'student';
type StudentStep = 'location' | 'details' | 'payment' | 'success';

interface SchoolOption {
  id: string;
  school_code: string;
  name: string;
  city: string;
  state: string;
  country: string;
  project_slug: string;
  pricing: Pricing[];
}

const SS: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', color: 'var(--text)', background: 'var(--card)',
  appearance: 'none' as any, boxSizing: 'border-box' as any,
};
const IS: React.CSSProperties = { ...SS, appearance: undefined };

// ── Helpers ───────────────────────────────────────────────────────
function detectIsIndia() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata';
  } catch { return true; }
}

// ── Main component ────────────────────────────────────────────────
export default function OpenRegistrationPage({
  projectSlug,
  paymentError,
}: {
  projectSlug: string;
  paymentError?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [programName, setProgramName] = useState('');
  const [isIndia, setIsIndia] = useState(true);

  useEffect(() => {
    setIsIndia(detectIsIndia());
    // Load program name for badge
    fetch(`${BACKEND}/api/project?slug=${encodeURIComponent(projectSlug)}`)
      .then(r => r.json())
      .then(d => { if (d.project?.name) setProgramName(d.project.name); })
      .catch(() => {});
  }, [projectSlug]);

  if (mode === 'school') {
    return (
      <SchoolRegistrationForm
        projectSlug={projectSlug}
        onBack={() => setMode('choose')}
      />
    );
  }

  if (mode === 'student') {
    return (
      <StudentOpenFlow
        projectSlug={projectSlug}
        programName={programName}
        isIndia={isIndia}
        paymentError={paymentError}
        onBack={() => setMode('choose')}
      />
    );
  }

  // ── Mode chooser ──────────────────────────────────────────────
  return (
    <div className="atg-card" id="atgCard">
      <div className="card-header">
        <h1>Thynk Success</h1>
        {programName && <p>🎯 {programName}</p>}
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--m)', marginBottom: 24, textAlign: 'center' }}>
          Please select your registration type to continue
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* School Registration */}
          <button
            onClick={() => setMode('school')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'block',
              border: '2px solid var(--bd)', borderRadius: 16, padding: '20px',
              background: 'var(--card)', transition: 'border-color .15s, box-shadow .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = '#4f46e5';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px #4f46e522';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--bd)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🏫</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>
                  School Registration
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 6 }}>
                  ⚠️ Officials Only — Not for students
                </div>
                <div style={{ fontSize: 12, color: 'var(--m)', lineHeight: 1.5 }}>
                  Register your school to participate. Our team will review and approve your application.
                </div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--m2)' }}>→</div>
            </div>
          </button>

          {/* Student Registration */}
          <button
            onClick={() => setMode('student')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'block',
              border: '2px solid var(--bd)', borderRadius: 16, padding: '20px',
              background: 'var(--card)', transition: 'border-color .15s, box-shadow .15s',
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🎓</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>
                  Student Registration
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 6 }}>
                  For students &amp; parents only
                </div>
                <div style={{ fontSize: 12, color: 'var(--m)', lineHeight: 1.5 }}>
                  {programName ? <>Register for <strong>{programName}</strong>. Fill your details and complete payment.</> : 'Fill in your details and complete payment to register.'}
                </div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--m2)' }}>→</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Student Open Flow ─────────────────────────────────────────────
// Country → State → City → School picker → student details → payment
function StudentOpenFlow({
  projectSlug,
  programName,
  isIndia,
  paymentError,
  onBack,
}: {
  projectSlug: string;
  programName: string;
  isIndia: boolean;
  paymentError?: boolean;
  onBack: () => void;
}) {
  const [studentStep, setStudentStep] = useState<StudentStep>('location');

  // Location state
  const [country, setCountry] = useState('India');
  const [state, setState]     = useState('');
  const [city, setCity]       = useState('');

  // Schools
  const [schools, setSchools]         = useState<SchoolOption[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolOption | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<Pricing | null>(null);

  // Grades
  const [gradeOptions, setGradeOptions] = useState<string[]>([]);

  // Student form
  const [fd, setFd] = useState<Record<string, string>>({
    studentName: '', classGrade: '', gender: '',
    parentName: '', contactPhone: '', contactEmail: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const countryList  = Object.keys(LOCATION_DATA);
  const stateList    = country ? Object.keys(LOCATION_DATA[country] ?? {}) : [];
  const cityList     = (country && state) ? (LOCATION_DATA[country]?.[state] ?? []) : [];

  // Load schools when city changes
  useEffect(() => {
    if (!city || !state) { setSchools([]); setSelectedSchool(null); return; }
    setSchoolsLoading(true);
    setSelectedSchool(null);
    setSelectedPricing(null);
    const url = `${BACKEND}/api/school/list?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&project=${encodeURIComponent(projectSlug)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setSchools(d.schools ?? []); })
      .catch(() => setSchools([]))
      .finally(() => setSchoolsLoading(false));
  }, [city, state, projectSlug]);

  // Load grades when school is selected
  useEffect(() => {
    if (!selectedSchool) { setGradeOptions([]); return; }
    fetch(`${BACKEND}/api/grades?project=${encodeURIComponent(projectSlug)}`)
      .then(r => r.json())
      .then(d => setGradeOptions(d.grades ?? []))
      .catch(() => setGradeOptions([]));
  }, [selectedSchool, projectSlug]);

  function handleSchoolSelect(schoolId: string) {
    const s = schools.find(sc => sc.id === schoolId) ?? null;
    setSelectedSchool(s);
    setSelectedPricing(s ? (s.pricing?.[0] ?? null) : null);
  }

  function validateLocation() {
    if (!country) return 'Please select a country';
    if (!state)   return 'Please select a state';
    if (!city)    return 'Please select a city';
    if (!selectedSchool) return 'Please select a school';
    return null;
  }

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

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFd(p => ({ ...p, [k]: e.target.value }));

  const DEFAULT_GRADES = ['Nursery','KG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
    'Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
  const grades = gradeOptions.length ? gradeOptions : DEFAULT_GRADES;

  // ── Render: location step ─────────────────────────────────────
  if (studentStep === 'location') {
    const locError = (!country || !state || !city || !selectedSchool) ? '' : null;
    return (
      <div className="atg-card" id="atgCard">
        <div className="card-header">
          <h1>Student Registration</h1>
          {programName && <p>🎯 {programName}</p>}
        </div>
        <div className="card-body">
          <StepBar step={1} />
          <div className="form-section-title">📍 Select Your School</div>
          <div className="form-section-sub">Choose your country, state, city, then select your school.</div>

          {/* Country */}
          <div className="field">
            <label className="field-label">Country <span style={{ color: 'var(--red)' }}>*</span></label>
            <div className="select-wrap">
              <select style={SS} value={country} onChange={e => { setCountry(e.target.value); setState(''); setCity(''); setSelectedSchool(null); }}>
                {countryList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* State */}
          <div className="field">
            <label className="field-label">State / Region <span style={{ color: 'var(--red)' }}>*</span></label>
            <div className="select-wrap">
              <select style={SS} value={state} onChange={e => { setState(e.target.value); setCity(''); setSelectedSchool(null); }} disabled={!country}>
                <option value="">Select state</option>
                {stateList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* City */}
          <div className="field">
            <label className="field-label">City <span style={{ color: 'var(--red)' }}>*</span></label>
            <div className="select-wrap">
              <select style={SS} value={city} onChange={e => setCity(e.target.value)} disabled={!state}>
                <option value="">Select city</option>
                {cityList.map(c => <option key={c} value={c}>{c}</option>)}
                {cityList.length > 0 && <option value="Other">Other</option>}
              </select>
            </div>
          </div>

          {/* School picker */}
          {city && (
            <div className="field">
              <label className="field-label">School <span style={{ color: 'var(--red)' }}>*</span></label>
              {schoolsLoading ? (
                <div style={{ fontSize: 13, color: 'var(--m)', padding: '10px 0' }}>⏳ Loading schools…</div>
              ) : schools.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red2)', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px' }}>
                  No registered schools found in {city}. Please contact your school or select a different city.
                </div>
              ) : (
                <div className="select-wrap">
                  <select
                    style={SS}
                    value={selectedSchool?.id ?? ''}
                    onChange={e => handleSchoolSelect(e.target.value)}
                  >
                    <option value="">Select school</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Selected school info card */}
          {selectedSchool && (
            <div style={{ background: 'var(--acc3)', border: '1px solid rgba(79,70,229,.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--acc)', marginBottom: 4 }}>✅ {selectedSchool.name}</div>
              <div style={{ color: 'var(--m)' }}>{[selectedSchool.city, selectedSchool.state, selectedSchool.country].filter(Boolean).join(', ')}</div>
              {selectedPricing && (
                <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text)' }}>
                  {selectedPricing.program_name} · {country === 'India' ? '₹' : '$'}{(selectedPricing.base_amount / 100).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn-back" onClick={onBack}>← Back</button>
            <button
              className="btn-next"
              disabled={!selectedSchool}
              onClick={() => {
                const err = validateLocation();
                if (!err) setStudentStep('details');
              }}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: details step ──────────────────────────────────────
  if (studentStep === 'details') {
    return (
      <div className="atg-card" id="atgCard">
        <div className="card-header">
          <h1>Student Details</h1>
          {selectedSchool && <p>{selectedSchool.name}</p>}
        </div>
        <div className="card-body">
          <StepBar step={1} />

          {/* Locked school info */}
          <div style={{ background: 'var(--acc3)', border: '1px solid rgba(79,70,229,.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: 'var(--acc)', marginBottom: 2 }}>📍 {selectedSchool?.name}</div>
            <div style={{ color: 'var(--m)' }}>{city}, {state}, {country}</div>
          </div>

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
            <button className="btn-back" onClick={() => setStudentStep('location')}>← Back</button>
            <button className="btn-next" onClick={() => { if (validateDetails()) setStudentStep('payment'); }}>
              Continue to Payment →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: payment step ──────────────────────────────────────
  if (studentStep === 'payment' && selectedSchool && selectedPricing) {
    return (
      <PaymentStep
        school={selectedSchool}
        pricing={selectedPricing}
        formData={{
          studentName:  fd.studentName,
          classGrade:   fd.classGrade,
          gender:       fd.gender,
          parentSchool: selectedSchool.name,
          city:         city,
          parentName:   fd.parentName,
          contactPhone: fd.contactPhone,
          contactEmail: fd.contactEmail,
        }}
        isIndia={isIndia}
        paymentError={paymentError}
        onBack={() => setStudentStep('details')}
        onSuccess={() => setStudentStep('success')}
      />
    );
  }

  // ── Render: success ───────────────────────────────────────────
  if (studentStep === 'success') {
    return <SuccessScreen />;
  }

  return null;
}

// ── Shared sub-components ─────────────────────────────────────────
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

function SuccessScreen() {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = 'https://www.thynksuccess.com';
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
