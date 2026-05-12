'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const fmtR = (p: number) => (p / 100).toLocaleString('en-IN');
const fmt  = (n: any)    => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const IS: React.CSSProperties = {
  width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 14px',
  fontSize:14, fontFamily:'DM Sans,sans-serif', outline:'none',
  color:'var(--text)', background:'var(--bg)', boxSizing:'border-box',
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase',
                     letterSpacing:'0.5px', display:'block', marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}
function Badge({ status }: { status: string }) {
  const map: Record<string, [string,string]> = {
    paid:      ['#d1fae5','#065f46'],
    initiated: ['#ede9fe','#3730a3'],
    pending:   ['#fef3c7','#92400e'],
    failed:    ['#fee2e2','#991b1b'],
    approved:  ['#d1fae5','#065f46'],
    active:    ['#d1fae5','#065f46'],
  };
  const [bg, fg] = map[status] ?? ['#f3f4f6','#374151'];
  return (
    <span style={{background:bg, color:fg, borderRadius:20, padding:'3px 10px',
                  fontSize:11, fontWeight:700}}>{status}</span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, gradient }: any) {
  return (
    <div style={{
      background: gradient, borderRadius:16, padding:'20px 20px 16px',
      display:'flex', flexDirection:'column', gap:8, flex:1, minWidth:140,
    }}>
      <div style={{fontSize:24}}>{icon}</div>
      <div style={{fontSize:26, fontWeight:800, color:'var(--text)', fontFamily:'Sora,sans-serif'}}>{value}</div>
      <div style={{fontSize:12, color:'var(--m)', fontWeight:600}}>{label}</div>
    </div>
  );
}

// ── Create School Modal ───────────────────────────────────────────────────────
function CreateSchoolModal({ onClose, onCreated, BACKEND }: {
  onClose: () => void;
  onCreated: () => void;
  BACKEND: string;
}) {
  const [programs, setPrograms] = useState<Row[]>([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [f, setF] = useState({
    school_code:'', name:'', org_name:'', address:'', pin_code:'',
    country:'India', state:'', city:'', project_id:'',
    school_price:'', currency:'INR', discount_code:'',
    primary_color:'#4f46e5', accent_color:'#8b5cf6',
    is_active:true, is_registration_active:true,
  });
  const [contacts, setContacts] = useState([{ name:'', designation:'', email:'', mobile:'' }]);

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/projects`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setPrograms((d?.projects ?? []).filter((p: Row) => p.status === 'active')));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setF(p => {
      const u: any = { ...p, [k]: val };
      if (k === 'school_code') u.discount_code = (val as string).toUpperCase();
      if (k === 'country') u.currency = (val as string) === 'India' ? 'INR' : 'USD';
      return u;
    });
  };

  async function handleSave() {
    if (!f.school_code || !f.name || !f.org_name || !f.project_id || !f.school_price) {
      setError('School Code, Name, Org Name, Program and Price are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await authFetch(`${BACKEND}/api/admin/schools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          school_price: Math.round(Number(f.school_price) * 100),
          contact_persons: contacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create school'); setSaving(false); return; }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message); setSaving(false);
    }
  }

  const selProgram = programs.find(p => p.id === f.project_id);

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:20,
        width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto',
        padding:'28px 28px 24px',
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
          <h2 style={{margin:0, fontSize:18, fontWeight:800, color:'var(--text)', fontFamily:'Sora,sans-serif'}}>🏫 Create New School</h2>
          <button onClick={onClose} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--m)'}}>✕</button>
        </div>

        {error && (
          <div style={{background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)',
                       borderRadius:10, padding:'10px 14px', fontSize:13, color:'#ef4444', marginBottom:16}}>
            {error}
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px'}}>
          <Field label="School Code *">
            <input style={{...IS, fontFamily:'monospace'}} value={f.school_code}
              onChange={set('school_code')} placeholder="e.g. delhi-dps" />
          </Field>
          <Field label="School Name *">
            <input style={IS} value={f.name} onChange={set('name')} placeholder="Delhi Public School" />
          </Field>
          <Field label="Organisation Name *">
            <input style={IS} value={f.org_name} onChange={set('org_name')} placeholder="DPS Society" />
          </Field>
          <Field label="Country *">
            <select style={IS} value={f.country} onChange={set('country')}>
              {['India','United Arab Emirates','Saudi Arabia','Kuwait','Qatar','Bahrain','Singapore','Malaysia'].map(c =>
                <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="State *">
            <input style={IS} value={f.state} onChange={set('state')} placeholder="Gujarat" />
          </Field>
          <Field label="City *">
            <input style={IS} value={f.city} onChange={set('city')} placeholder="Ahmedabad" />
          </Field>
        </div>

        <Field label="Address">
          <textarea style={{...IS, height:64, resize:'vertical'}} value={f.address}
            onChange={set('address')} placeholder="Full street address…" />
        </Field>
        <Field label="Pin Code">
          <input style={IS} value={f.pin_code} onChange={set('pin_code')} placeholder="380001" />
        </Field>

        {/* Contact Persons */}
        <div style={{border:'1.5px solid var(--bd)', borderRadius:12, padding:'14px 16px', marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div style={{fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'0.5px'}}>👤 Contact Persons</div>
            {contacts.length < 4 && (
              <button onClick={() => setContacts(c => [...c, { name:'', designation:'', email:'', mobile:'' }])}
                style={{background:'rgba(79,70,229,.1)', color:'#4f46e5', border:'1px solid rgba(79,70,229,.3)',
                        borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:600, cursor:'pointer'}}>
                + Add
              </button>
            )}
          </div>
          {contacts.map((c, idx) => (
            <div key={idx} style={{background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:10,
                                   padding:'12px 14px', marginBottom:idx < contacts.length-1 ? 10 : 0}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <span style={{fontSize:11, fontWeight:700, color:'var(--m)'}}>Contact {idx+1}</span>
                {contacts.length > 1 && (
                  <button onClick={() => setContacts(p => p.filter((_,i) => i !== idx))}
                    style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:14}}>✕</button>
                )}
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px'}}>
                {(['name','designation','email','mobile'] as const).map(k => (
                  <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                    <input style={IS} value={c[k]}
                      onChange={e => setContacts(prev => prev.map((x,i) => i===idx ? {...x,[k]:e.target.value} : x))}
                      placeholder={k === 'email' ? 'school@example.com' : k === 'mobile' ? '+91 98765 43210' : ''} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Program & Pricing */}
        <div style={{border:'1.5px solid var(--bd)', borderRadius:12, padding:'14px 16px', marginBottom:14}}>
          <div style={{fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12}}>💰 Program & Pricing</div>
          <Field label="Program *">
            <select style={IS} value={f.project_id} onChange={set('project_id')}>
              <option value="">Select a program</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {selProgram && (
            <div style={{background:'rgba(79,70,229,.06)', borderRadius:8, padding:'8px 12px', marginBottom:12,
                         display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:12, color:'var(--m)', fontWeight:600}}>Program Base Price</span>
              <span style={{fontSize:15, fontWeight:800, color:'#4f46e5', fontFamily:'Sora,sans-serif'}}>
                {f.country === 'India'
                  ? `₹${fmtR(selProgram.base_amount_inr ?? selProgram.base_amount ?? 0)}`
                  : `$${fmtR(selProgram.base_amount_usd ?? 0)}`}
              </span>
            </div>
          )}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px'}}>
            <Field label={`School Price (${f.currency}) *`}>
              <input style={IS} type="number" value={f.school_price} onChange={set('school_price')} placeholder="400" />
            </Field>
            <Field label="Currency">
              <select style={IS} value={f.currency} onChange={set('currency')}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </Field>
          </div>
        </div>

        <Field label="Discount Code">
          <input style={{...IS, textTransform:'uppercase', fontFamily:'monospace', fontWeight:700}}
            value={f.discount_code}
            onChange={e => setF(p => ({...p, discount_code: e.target.value.toUpperCase()}))}
            placeholder="DELHI-DPS" />
        </Field>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:20}}>
          <button onClick={onClose} style={{padding:'10px 20px', borderRadius:10, border:'1.5px solid var(--bd)',
                                            background:'var(--card)', fontFamily:'DM Sans,sans-serif',
                                            fontSize:14, fontWeight:700, cursor:'pointer', color:'var(--m)'}}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding:'10px 24px', borderRadius:10, border:'none',
            background: saving ? 'rgba(79,70,229,.5)' : '#4f46e5', color:'#fff',
            fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? '⏳ Creating…' : '✅ Create School'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function ConsultantDashboard() {
  const router  = useRouter();
  const [user,   setUser]   = useState<any>(null);
  const [data,   setData]   = useState<any>(null);
  const [loading,setLoading]= useState(true);
  const [tab,    setTab]    = useState<'schools'|'report'>('schools');
  const [showCreate, setShowCreate] = useState(false);
  const [toast,  setToast]  = useState('');
  const toastRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      if (!d.user) { router.push('/consultant/login'); return; }
      setUser(d.user);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BACKEND}/api/consultant?view=report`);
      if (res.status === 401 || res.status === 403) { router.push('/consultant/login'); return; }
      const json = await res.json();
      setData(json);
    } catch (e: any) { showToast('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (user) load(); }, [user, load]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 4000);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/consultant/login');
  }

  function exportCSV(rows: Row[], filename: string) {
    const cols = ['student_name','class_grade','gender','school_name','parent_name',
                  'contact_phone','payment_status','final_amount','paid_at'];
    const csv  = [cols.join(','), ...rows.map(r =>
      cols.map(c => JSON.stringify(r[c] ?? '')).join(',')
    )].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
    a.download = filename;
    a.click();
  }

  const schools  = data?.schools ?? [];
  const stats    = data?.stats;
  const allRows  = data?.rows ?? [];
  const bySchool = data?.bySchool ?? {};

  // Filtered report rows
  const reportRows = allRows.filter((r: Row) => {
    const matchSchool = selectedSchool === 'all' || r.school_id === selectedSchool;
    const matchSearch = !search.trim() || [r.student_name, r.school_name, r.contact_phone].some(
      v => v?.toLowerCase().includes(search.toLowerCase())
    );
    return matchSchool && matchSearch;
  });

  if (!user || loading) return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh',
                 fontFamily:'DM Sans,sans-serif', color:'var(--m)'}}>
      ⏳ Loading…
    </div>
  );

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', fontFamily:'DM Sans,sans-serif'}}>
      {/* Header */}
      <div style={{borderBottom:'1.5px solid var(--bd)', padding:'14px 28px',
                   display:'flex', alignItems:'center', justifyContent:'space-between',
                   background:'var(--card)', position:'sticky', top:0, zIndex:10}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                       display:'flex', alignItems:'center', justifyContent:'center',
                       fontSize:18, color:'#fff', fontWeight:800}}>T</div>
          <div>
            <div style={{fontSize:16, fontWeight:800, color:'var(--text)', fontFamily:'Sora,sans-serif'}}>Consultant Portal</div>
            <div style={{fontSize:11, color:'var(--m)'}}>🤝 {user?.email}</div>
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={() => setShowCreate(true)} style={{
            background:'linear-gradient(135deg,#4f46e5,#7c3aed)', color:'#fff',
            border:'none', borderRadius:10, padding:'8px 16px',
            fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif',
          }}>+ Create School</button>
          <button onClick={load} style={{
            background:'var(--bg)', border:'1.5px solid var(--bd)', color:'var(--m)',
            borderRadius:10, padding:'8px 12px', fontSize:13, cursor:'pointer',
          }}>🔄</button>
          <button onClick={doLogout} style={{
            background:'rgba(239,68,68,.08)', border:'1.5px solid rgba(239,68,68,.2)',
            color:'#ef4444', borderRadius:10, padding:'8px 14px',
            fontSize:13, fontWeight:600, cursor:'pointer',
          }}>Logout</button>
        </div>
      </div>

      <div style={{padding:'24px 28px', maxWidth:1280, margin:'0 auto'}}>
        {/* Stats Row */}
        {stats && (
          <div style={{display:'flex', gap:14, marginBottom:24, flexWrap:'wrap'}}>
            <StatCard icon="🏫" label="My Schools" value={stats.schoolCount}
              gradient="linear-gradient(135deg,rgba(79,70,229,.12),rgba(124,58,237,.08))" />
            <StatCard icon="👥" label="Total Students" value={stats.total}
              gradient="linear-gradient(135deg,rgba(16,185,129,.12),rgba(5,150,105,.08))" />
            <StatCard icon="✅" label="Paid" value={stats.paid}
              gradient="linear-gradient(135deg,rgba(16,185,129,.12),rgba(5,150,105,.08))" />
            <StatCard icon="⏳" label="Pending" value={stats.pending}
              gradient="linear-gradient(135deg,rgba(245,158,11,.12),rgba(217,119,6,.08))" />
            <StatCard icon="💰" label="Revenue" value={`₹${fmt(stats.totalRev/100)}`}
              gradient="linear-gradient(135deg,rgba(79,70,229,.12),rgba(124,58,237,.08))" />
          </div>
        )}

        {/* Tabs */}
        <div style={{display:'flex', gap:4, marginBottom:20, borderBottom:'1.5px solid var(--bd)', paddingBottom:0}}>
          {(['schools','report'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background:'none', border:'none', borderBottom: tab===t ? '2.5px solid #4f46e5' : '2.5px solid transparent',
              color: tab===t ? '#4f46e5' : 'var(--m)',
              padding:'10px 16px', fontSize:14, fontWeight: tab===t ? 700 : 500,
              cursor:'pointer', textTransform:'capitalize', fontFamily:'DM Sans,sans-serif',
              marginBottom:-1.5,
            }}>{t === 'schools' ? '🏫 My Schools' : '📊 Reports'}</button>
          ))}
        </div>

        {/* Schools Tab */}
        {tab === 'schools' && (
          <div>
            {schools.length === 0 ? (
              <div style={{textAlign:'center', padding:'60px 0', color:'var(--m)'}}>
                <div style={{fontSize:48, marginBottom:12}}>🏫</div>
                <div style={{fontSize:16, fontWeight:700, marginBottom:8}}>No schools yet</div>
                <div style={{fontSize:13, marginBottom:24}}>Create your first school to get started</div>
                <button onClick={() => setShowCreate(true)} style={{
                  background:'#4f46e5', color:'#fff', border:'none', borderRadius:12,
                  padding:'12px 24px', fontSize:14, fontWeight:700, cursor:'pointer',
                }}>+ Create School</button>
              </div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16}}>
                {schools.map((s: Row) => {
                  const sc = bySchool[s.id] ?? { total:0, paid:0, revenue:0 };
                  return (
                    <div key={s.id} style={{
                      background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16,
                      padding:'18px 20px', display:'flex', flexDirection:'column', gap:12,
                    }}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <div>
                          <div style={{fontSize:15, fontWeight:800, color:'var(--text)', fontFamily:'Sora,sans-serif'}}>{s.name}</div>
                          <div style={{fontSize:11, color:'var(--m)', marginTop:2}}>{s.org_name}</div>
                          <div style={{fontSize:11, color:'var(--m)'}}>{[s.city, s.state, s.country].filter(Boolean).join(', ')}</div>
                        </div>
                        <Badge status={s.is_active ? 'active' : 'inactive'} />
                      </div>
                      <div style={{fontSize:11, color:'var(--m)', fontFamily:'monospace',
                                   background:'var(--bg)', borderRadius:6, padding:'4px 8px', width:'fit-content'}}>
                        {s.school_code}
                      </div>
                      <div style={{display:'flex', gap:10}}>
                        <div style={{flex:1, background:'rgba(16,185,129,.08)', borderRadius:10,
                                     padding:'8px 12px', textAlign:'center'}}>
                          <div style={{fontSize:18, fontWeight:800, color:'#10b981'}}>{sc.paid}</div>
                          <div style={{fontSize:10, color:'var(--m)', fontWeight:600}}>PAID</div>
                        </div>
                        <div style={{flex:1, background:'rgba(79,70,229,.08)', borderRadius:10,
                                     padding:'8px 12px', textAlign:'center'}}>
                          <div style={{fontSize:18, fontWeight:800, color:'#4f46e5'}}>{sc.total}</div>
                          <div style={{fontSize:10, color:'var(--m)', fontWeight:600}}>TOTAL</div>
                        </div>
                        <div style={{flex:1, background:'rgba(245,158,11,.08)', borderRadius:10,
                                     padding:'8px 12px', textAlign:'center'}}>
                          <div style={{fontSize:18, fontWeight:800, color:'#f59e0b'}}>₹{fmt(sc.revenue/100)}</div>
                          <div style={{fontSize:10, color:'var(--m)', fontWeight:600}}>REVENUE</div>
                        </div>
                      </div>
                      <div style={{fontSize:11, color:'var(--m)', display:'flex', gap:8, alignItems:'center'}}>
                        <span>🔗</span>
                        <a href={`https://thynksuccess.com/registration/${s.project_slug}/?school=${s.school_code}`}
                          target="_blank" rel="noreferrer"
                          style={{color:'#4f46e5', textDecoration:'none', fontFamily:'monospace', fontSize:11,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:240}}>
                          {`thynksuccess.com/registration/${s.project_slug}/?school=${s.school_code}`}
                        </a>
                        <button onClick={() => {
                          navigator.clipboard.writeText(`https://thynksuccess.com/registration/${s.project_slug}/?school=${s.school_code}`);
                          showToast('Link copied!');
                        }} style={{background:'none', border:'none', cursor:'pointer', color:'var(--m)', fontSize:13}}>📋</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Report Tab */}
        {tab === 'report' && (
          <div>
            {/* Filters */}
            <div style={{display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center'}}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search student, school, phone…"
                style={{...IS, maxWidth:300, flex:1}} />
              <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} style={{...IS, maxWidth:220}}>
                <option value="all">All Schools</option>
                {schools.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={() => exportCSV(reportRows, 'consultant-report.csv')} style={{
                background:'rgba(16,185,129,.1)', border:'1.5px solid rgba(16,185,129,.3)',
                color:'#10b981', borderRadius:10, padding:'8px 16px',
                fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap',
              }}>⬇️ Export CSV</button>
              <span style={{fontSize:12, color:'var(--m)', whiteSpace:'nowrap'}}>{reportRows.length} records</span>
            </div>

            {/* Per-school summary */}
            {selectedSchool === 'all' && schools.length > 1 && (
              <div style={{display:'flex', gap:10, marginBottom:16, flexWrap:'wrap'}}>
                {schools.map((s: Row) => {
                  const sc = bySchool[s.id] ?? { total:0, paid:0, revenue:0 };
                  return (
                    <div key={s.id} onClick={() => setSelectedSchool(s.id)}
                      style={{
                        background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:12,
                        padding:'12px 16px', cursor:'pointer', minWidth:160,
                        transition:'border-color .15s',
                      }}>
                      <div style={{fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4}}>{s.name}</div>
                      <div style={{fontSize:11, color:'var(--m)'}}>
                        {sc.paid}/{sc.total} paid · ₹{fmt(sc.revenue/100)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table */}
            <div style={{overflowX:'auto', borderRadius:14, border:'1.5px solid var(--bd)'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                <thead>
                  <tr style={{background:'var(--bg)'}}>
                    {['Date','Student','Class','School','Contact','Status','Amount','Paid At'].map(h => (
                      <th key={h} style={{padding:'10px 14px', textAlign:'left', fontSize:11,
                                          fontWeight:700, color:'var(--m)', textTransform:'uppercase',
                                          letterSpacing:'0.5px', whiteSpace:'nowrap',
                                          borderBottom:'1.5px solid var(--bd)'}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.length === 0 ? (
                    <tr><td colSpan={8} style={{padding:'40px 0', textAlign:'center', color:'var(--m)'}}>No records found</td></tr>
                  ) : reportRows.map((r: Row, i: number) => (
                    <tr key={r.id} style={{borderBottom:'1px solid var(--bd)',
                                           background: i%2 === 0 ? 'transparent' : 'rgba(0,0,0,.015)'}}>
                      <td style={{padding:'10px 14px', color:'var(--m)', whiteSpace:'nowrap'}}>
                        {r.created_at?.slice(0,10)}
                      </td>
                      <td style={{padding:'10px 14px', fontWeight:600, color:'var(--text)'}}>
                        {r.student_name}
                      </td>
                      <td style={{padding:'10px 14px', color:'var(--m)'}}>{r.class_grade}</td>
                      <td style={{padding:'10px 14px', color:'var(--m)'}}>{r.school_name}</td>
                      <td style={{padding:'10px 14px', color:'var(--m)'}}>{r.contact_phone}</td>
                      <td style={{padding:'10px 14px'}}>
                        <Badge status={r.payment_status ?? 'unknown'} />
                      </td>
                      <td style={{padding:'10px 14px', fontWeight:700, color:'var(--text)', fontFamily:'monospace'}}>
                        {r.final_amount ? `₹${fmtR(r.final_amount)}` : '—'}
                      </td>
                      <td style={{padding:'10px 14px', color:'var(--m)', whiteSpace:'nowrap'}}>
                        {r.paid_at ? new Date(r.paid_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create School Modal */}
      {showCreate && (
        <CreateSchoolModal
          BACKEND={BACKEND}
          onClose={() => setShowCreate(false)}
          onCreated={() => { showToast('✅ School created!'); load(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:24, right:24, background:'var(--card)',
          border:'1.5px solid var(--bd)', borderRadius:14, padding:'12px 20px',
          fontSize:14, fontWeight:600, color:'var(--text)', zIndex:9999,
          boxShadow:'0 8px 32px rgba(0,0,0,.12)',
        }}>{toast}</div>
      )}
    </div>
  );
}
