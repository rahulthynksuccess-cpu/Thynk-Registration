'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;
const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p / 100);
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function StatCard({ icon, label, value, sub, color = 'var(--acc)' }: any) {
  return (
    <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'20px 22px', display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontSize:22 }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:800, color, fontFamily:'Sora,sans-serif' }}>{value}</div>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--m)' }}>{sub}</div>}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid:      ['#10b981','#d1fae5'],
    initiated: ['#4f46e5','#ede9fe'],
    pending:   ['#f59e0b','#fef3c7'],
    failed:    ['#ef4444','#fee2e2'],
    cancelled: ['#94a3b8','#f1f5f9'],
  };
  const [fg, bg] = map[status] ?? ['#64748b','#f1f5f9'];
  return <span style={{ background:bg, color:fg, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{status ?? '—'}</span>;
}

// byClass = { 'Grade 1': 5, 'Grade 2': 3 } — paid counts only
function ClassBreakdownCard({ byClass, totalPaid }: { byClass: Record<string, number>; totalPaid: number }) {
  const classes = Object.keys(byClass).sort();
  const maxCount = Math.max(...classes.map(c => byClass[c]), 1);
  return (
    <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:20 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:16, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
        📚 Class-wise Paid
        <span style={{ fontSize:10, background:'rgba(16,185,129,0.1)', color:'#10b981', padding:'2px 8px', borderRadius:20, fontWeight:600, marginLeft:'auto' }}>Paid only</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:320, overflowY:'auto' }}>
        {classes.length === 0 && <p style={{ color:'var(--m)', fontSize:13 }}>No paid registrations yet.</p>}
        {classes.map(cls => {
          const count = byClass[cls];
          const pct   = Math.round((count / maxCount) * 100);
          const share = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          return (
            <div key={cls} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6, fontSize:11, fontWeight:700, flexShrink:0, minWidth:72, textAlign:'center' }}>{cls}</span>
              <div style={{ flex:1, height:10, borderRadius:5, overflow:'hidden', background:'var(--bd)' }}>
                <div style={{ width:`${pct}%`, height:'100%', background:'#10b981', borderRadius:5 }} />
              </div>
              <span style={{ fontSize:12, fontWeight:800, color:'#10b981', minWidth:20, textAlign:'right' }}>{count}</span>
              <span style={{ fontSize:10, color:'var(--m)', minWidth:32 }}>{share}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// byGender = { 'Male': 8, 'Female': 6 } — paid counts only
function GenderBreakdownCard({ byGender, totalPaid }: { byGender: Record<string, number>; totalPaid: number }) {
  const GC: Record<string, { fg:string; bg:string; icon:string }> = {
    Male:    { fg:'#2563eb', bg:'#eff6ff', icon:'👦' },
    Female:  { fg:'#db2777', bg:'#fdf2f8', icon:'👧' },
    Other:   { fg:'#7c3aed', bg:'#f5f3ff', icon:'🧑' },
    Unknown: { fg:'#64748b', bg:'#f1f5f9', icon:'❓' },
  };
  const genders = Object.keys(byGender);
  return (
    <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:20 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:16, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
        ⚧ Gender-wise Paid
        <span style={{ fontSize:10, background:'rgba(16,185,129,0.1)', color:'#10b981', padding:'2px 8px', borderRadius:20, fontWeight:600, marginLeft:'auto' }}>Paid only</span>
      </div>
      <div style={{ display:'flex', gap:10 }}>
        {genders.length === 0 && <p style={{ color:'var(--m)', fontSize:13 }}>No paid registrations yet.</p>}
        {genders.map(g => {
          const { fg, bg, icon } = GC[g] ?? { fg:'#64748b', bg:'#f1f5f9', icon:'❓' };
          const count = byGender[g];
          const pct   = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          return (
            <div key={g} style={{ flex:1, background:bg, border:`1.5px solid ${fg}33`, borderRadius:12, padding:'16px 12px', textAlign:'center' }}>
              <div style={{ fontSize:24 }}>{icon}</div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--m)', marginTop:4 }}>{g}</div>
              <div style={{ fontSize:28, fontWeight:800, fontFamily:'Sora', color:fg, margin:'6px 0 2px' }}>{count}</div>
              <div style={{ fontSize:11, color:'var(--m)' }}>{pct}% of paid</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// crossTab values are paid counts only
function CrossTabCard({ crossTab }: { crossTab: Record<string, Record<string, number>> }) {
  const sortedClasses = Object.keys(crossTab).sort();
  const allGenders    = [...new Set(sortedClasses.flatMap(c => Object.keys(crossTab[c])))].sort();
  const GC: Record<string, string> = { Male:'#2563eb', Female:'#db2777', Other:'#7c3aed', Unknown:'#94a3b8' };
  return (
    <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:20 }}>
      <div style={{ fontWeight:700, fontSize:14, marginBottom:16, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
        📊 Class × Gender Matrix
        <span style={{ fontSize:10, background:'rgba(16,185,129,0.1)', color:'#10b981', padding:'2px 8px', borderRadius:20, fontWeight:600, marginLeft:'auto' }}>Paid only</span>
      </div>
      {sortedClasses.length === 0 && <p style={{ color:'var(--m)', fontSize:13 }}>No paid registrations yet.</p>}
      {sortedClasses.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left', padding:'8px 12px', color:'var(--m)', fontWeight:600, fontSize:11, borderBottom:'2px solid var(--bd)' }}>Class</th>
                {allGenders.map(g => (
                  <th key={g} style={{ textAlign:'center', padding:'8px 12px', color: GC[g] ?? 'var(--m)', fontWeight:700, fontSize:11, borderBottom:'2px solid var(--bd)' }}>{g}</th>
                ))}
                <th style={{ textAlign:'center', padding:'8px 12px', color:'#10b981', fontWeight:700, fontSize:11, borderBottom:'2px solid var(--bd)' }}>Total Paid</th>
              </tr>
            </thead>
            <tbody>
              {sortedClasses.map((cls, i) => {
                const rowData  = crossTab[cls];
                const rowTotal = allGenders.reduce((s, g) => s + (Number(rowData[g]) || 0), 0);
                return (
                  <tr key={cls} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)', borderBottom:'1px solid var(--bd)' }}>
                    <td style={{ padding:'8px 12px' }}>
                      <span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:5, fontWeight:700, fontSize:12 }}>{cls}</span>
                    </td>
                    {allGenders.map(g => (
                      <td key={g} style={{ padding:'8px 12px', textAlign:'center', fontWeight: rowData[g] ? 700 : 400, color: rowData[g] ? 'var(--text)' : 'var(--m2)', fontSize:13 }}>
                        {Number(rowData[g] ?? 0) || '—'}
                      </td>
                    ))}
                    <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:800, color:'#10b981', fontSize:14 }}>{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'rgba(16,185,129,0.06)', borderTop:'2px solid var(--bd)' }}>
                <td style={{ padding:'8px 12px', fontWeight:800, color:'var(--m)', fontSize:11 }}>TOTAL PAID</td>
                {allGenders.map(g => {
                  const colTotal = sortedClasses.reduce((s, c) => s + (Number(crossTab[c][g]) || 0), 0);
                  return <td key={g} style={{ padding:'8px 12px', textAlign:'center', fontWeight:800, color:'var(--text)' }}>{colTotal}</td>;
                })}
                <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:900, color:'#10b981', fontSize:15 }}>
                  {sortedClasses.reduce((s, c) => s + allGenders.reduce((ss, g) => ss + (Number(crossTab[c][g]) || 0), 0), 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SchoolDashboard() {
  const router    = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'overview' | 'students'>('overview');
  const [studentTab,  setStudentTab]  = useState<'paid' | 'pending'>('paid');
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [toast,   setToast]   = useState('');
  const chartsRef = useRef<Record<string, any>>({});
  const toastRef  = useRef<any>();

  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      if (!d.user) { router.push('/school/login'); return; }
      setUser(d.user);
    });
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${BACKEND}/api/school/dashboard`);
      if (res.status === 401) { router.push('/school/login'); return; }
      if (res.status === 403) { showToast('Access denied — account not linked to a school'); setLoading(false); return; }
      const json = await res.json();
      if (json.error) { showToast(json.error); setLoading(false); return; }
      setData(json);
    } catch (e: any) {
      showToast('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { if (!user) return; load(); }, [user, load]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 4000);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/school/login');
  }

  function dc(id: string) {
    if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; }
  }

  useEffect(() => {
    if (!data || !(window as any).Chart || tab !== 'overview') return;
    const C = (window as any).Chart;

    dc('daily');
    const daily  = data.daily as Record<string, { total: number; paid: number }>;
    const labels = Object.keys(daily).map(d => new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }));
    const totals = Object.values(daily).map((v: any) => v.total);
    const paids  = Object.values(daily).map((v: any) => v.paid);
    const ctx = (document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if (ctx) chartsRef.current.daily = new C(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Registered', data:totals, backgroundColor:'rgba(79,70,229,.15)', borderColor:'#4f46e5', borderWidth:2, borderRadius:6, borderSkipped:false },
          { label:'Paid',       data:paids,  backgroundColor:'rgba(16,185,129,.75)', borderRadius:6, borderSkipped:false },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } }, x:{ grid:{ display:false } } } },
    });

    dc('status');
    const stats    = data.stats;
    const sLabels  = ['Paid','Pending','Failed'];
    const sValues  = [stats.paid, stats.pending, stats.failed];
    const sColors  = ['#10b981','#f59e0b','#ef4444'];
    const ctx2 = (document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2) chartsRef.current.status = new C(ctx2, {
      type: 'doughnut',
      data: { labels:sLabels, datasets:[{ data:sValues, backgroundColor:sColors, borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'65%' },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data]);

  const allRows: Row[] = data?.rows ?? [];
  const paidRows    = allRows.filter(r => r.payment_status === 'paid');
  const pendingRows = allRows.filter(r => r.payment_status !== 'paid');
  const classes     = [...new Set(allRows.map(r => r.class_grade).filter(Boolean))].sort();

  const activeStudentRows = studentTab === 'paid' ? paidRows : pendingRows;
  const filteredRows = activeStudentRows.filter(r => {
    const s = search.toLowerCase();
    const matchSearch = !s || [r.student_name, r.parent_name, r.contact_phone, r.contact_email, r.class_grade, r.gender].join(' ').toLowerCase().includes(s);
    const matchClass  = !classFilter || r.class_grade === classFilter;
    return matchSearch && matchClass;
  });

  if (!user || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏫</div>
        <p style={{ color:'var(--m)', fontSize:14 }}>Loading dashboard…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center', maxWidth:400 }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
        <p style={{ color:'var(--text)', fontSize:16, fontWeight:700, marginBottom:8 }}>Could not load dashboard</p>
        <p style={{ color:'var(--m)', fontSize:13, marginBottom:20 }}>Your account may not be linked to a school. Please contact your administrator.</p>
        <button onClick={doLogout} style={{ background:'var(--red2)', color:'var(--red)', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Sign Out</button>
      </div>
    </div>
  );

  const { stats, school, byClass, byGender, crossTab } = data;
  const TABS = [
    { id:'overview', icon:'🏠', label:'Overview'     },
    { id:'students', icon:'👨‍🎓', label:'All Students' },
  ] as const;

  return (
    <>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" async />

      {toast && (
        <div style={{ position:'fixed', top:16, right:16, background:'#1e293b', color:'#fff', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
          {toast}
        </div>
      )}

      <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:'DM Sans,sans-serif' }}>

        <header style={{ background:'var(--card)', borderBottom:'1.5px solid var(--bd)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:26 }}>🏫</span>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'var(--text)', lineHeight:1.2 }}>{school?.name ?? 'School Dashboard'}</div>
              <div style={{ fontSize:11, color:'var(--m)' }}>{school?.org_name ?? ''}{school?.city ? ` · ${school.city}` : ''}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button onClick={load} style={{ background:'var(--acc3)', color:'var(--acc)', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🔄 Refresh</button>
            <button onClick={doLogout} style={{ background:'var(--red2)', color:'var(--red)', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Sign Out</button>
          </div>
        </header>

        <div style={{ display:'flex', minHeight:'calc(100vh - 60px)' }}>

          <aside style={{ width:200, background:'var(--card)', borderRight:'1.5px solid var(--bd)', padding:'20px 12px', flexShrink:0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                style={{ width:'100%', textAlign:'left', border:'none', borderRadius:10, padding:'10px 12px', marginBottom:4, cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, background: tab === t.id ? 'var(--acc)' : 'transparent', color: tab === t.id ? '#fff' : 'var(--text)' }}
              >
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </aside>

          <main style={{ flex:1, padding:'24px', overflowY:'auto' }}>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div>
                <h2 style={{ margin:'0 0 20px', fontSize:22, fontWeight:800, color:'var(--text)' }}>
                  Overview
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--m)', marginLeft:12 }}>{school?.name}</span>
                </h2>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16, marginBottom:24 }}>
                  <StatCard icon="✅"  label="Paid Students"      value={stats?.paid    ?? 0} color="#10b981" sub={`₹${fmtR(stats?.totalRev ?? 0)} collected`} />
                  <StatCard icon="⏳"  label="Pending Payment"    value={stats?.unpaid  ?? 0} color="#f59e0b" />
                  <StatCard icon="👨‍🎓" label="Total Registered"   value={stats?.total   ?? 0} color="var(--acc)" />
                  <StatCard icon="❌"  label="Failed / Cancelled" value={stats?.failed  ?? 0} color="#ef4444" />
                  <StatCard icon="💰"  label="Total Revenue"      value={`₹${fmtR(stats?.totalRev ?? 0)}`} color="#8b5cf6" />
                  <StatCard icon="📈"  label="Conversion"
                    value={stats?.total ? `${Math.round((stats.paid / stats.total) * 100)}%` : '—'}
                    color="#06b6d4"
                  />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20, marginBottom:24 }}>
                  <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:20 }}>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:'var(--text)' }}>📅 Daily Registrations (Last 30 days)</div>
                    <div style={{ height:240 }}><canvas id="chartDaily" /></div>
                  </div>
                  <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:20 }}>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:'var(--text)' }}>💳 Payment Status</div>
                    <div style={{ height:240 }}><canvas id="chartStatus" /></div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
                  {byClass  && <ClassBreakdownCard  byClass={byClass}   totalPaid={stats?.paid ?? 0} />}
                  {byGender && <GenderBreakdownCard byGender={byGender} totalPaid={stats?.paid ?? 0} />}
                </div>
                {crossTab && (
                  <div style={{ marginBottom:24 }}>
                    <CrossTabCard crossTab={crossTab} />
                  </div>
                )}
              </div>
            )}

            {/* ── ALL STUDENTS ── */}
            {tab === 'students' && (
              <div>
                <h2 style={{ margin:'0 0 16px', fontSize:22, fontWeight:800, color:'var(--text)' }}>All Students</h2>

                <div style={{ display:'flex', gap:8, marginBottom:20, borderBottom:'2px solid var(--bd)' }}>
                  {([
                    { id:'paid',    label:'✅ Paid Students',      count: paidRows.length,    color:'#10b981' },
                    { id:'pending', label:'⏳ Pending / Not Paid', count: pendingRows.length, color:'#f59e0b' },
                  ] as const).map(st => (
                    <button key={st.id} onClick={() => { setStudentTab(st.id); setSearch(''); setClassFilter(''); }}
                      style={{ padding:'10px 20px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', borderBottom:`3px solid ${studentTab === st.id ? st.color : 'transparent'}`, color: studentTab === st.id ? st.color : 'var(--m)', marginBottom:-2, transition:'all .12s' }}
                    >
                      {st.label}
                      <span style={{ marginLeft:8, background: studentTab === st.id ? st.color : 'var(--bd)', color:'#fff', borderRadius:20, fontSize:10, padding:'1px 7px', fontWeight:800 }}>
                        {st.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                  <input placeholder="Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ flex:1, minWidth:200, border:'1.5px solid var(--bd)', borderRadius:10, padding:'9px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' }}
                  />
                  <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                    style={{ border:'1.5px solid var(--bd)', borderRadius:10, padding:'9px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' }}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span style={{ display:'flex', alignItems:'center', fontSize:12, color:'var(--m)' }}>
                    {filteredRows.length} of {activeStudentRows.length}
                  </span>
                </div>

                <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'var(--acc3)', borderBottom:'2px solid var(--bd)' }}>
                          {['#','Date','Student','Class','Gender','Parent','Phone','Program','Amount','Status'].map(h => (
                            <th key={h} style={{ textAlign:'left', padding:'10px 14px', color:'var(--m)', fontWeight:600, fontSize:11, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'var(--m)' }}>
                            {studentTab === 'paid' ? 'No paid students yet' : 'No pending students'}
                          </td></tr>
                        ) : filteredRows.map((r, i) => (
                          <tr key={r.id} style={{ borderBottom:'1px solid var(--bd)' }}>
                            <td style={{ padding:'10px 14px', color:'var(--m2)', fontSize:11 }}>{i + 1}</td>
                            <td style={{ padding:'10px 14px', color:'var(--m)', fontSize:11, whiteSpace:'nowrap' }}>{r.created_at?.slice(0,10)}</td>
                            <td style={{ padding:'10px 14px', fontWeight:700, whiteSpace:'nowrap' }}>{r.student_name}</td>
                            <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>{r.class_grade}</td>
                            <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>{r.gender}</td>
                            <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>{r.parent_name}</td>
                            <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                              <a href={`tel:${r.contact_phone}`} style={{ color:'var(--acc)', fontWeight:600, textDecoration:'none' }}>{r.contact_phone}</a>
                            </td>
                            <td style={{ padding:'10px 14px', fontSize:11, color:'var(--m)', whiteSpace:'nowrap' }}>{r.program_name ?? '—'}</td>
                            <td style={{ padding:'10px 14px', fontWeight:700, whiteSpace:'nowrap' }}>
                              {r.payment_status === 'paid' ? `₹${fmtR(r.final_amount)}` : '—'}
                            </td>
                            <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}><Badge status={r.payment_status ?? 'pending'} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}
