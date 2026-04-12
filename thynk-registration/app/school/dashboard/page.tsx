'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;
const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p / 100);
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = 'var(--acc)' }: any) {
  return (
    <div style={{
      background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,
      padding:'20px 22px',display:'flex',flexDirection:'column',gap:6,
    }}>
      <div style={{fontSize:22}}>{icon}</div>
      <div style={{fontSize:26,fontWeight:800,color,fontFamily:'Sora,sans-serif'}}>{value}</div>
      <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{label}</div>
      {sub && <div style={{fontSize:11,color:'var(--m)'}}>{sub}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid:      ['#10b981','#d1fae5'],
    initiated: ['#4f46e5','#ede9fe'],
    pending:   ['#f59e0b','#fef3c7'],
    failed:    ['#ef4444','#fee2e2'],
    cancelled: ['#94a3b8','#f1f5f9'],
  };
  const [fg, bg] = map[status] ?? ['#64748b','#f1f5f9'];
  return (
    <span style={{background:bg,color:fg,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>
      {status ?? '—'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SchoolDashboard() {
  const router  = useRouter();
  const [user,   setUser]   = useState<any>(null);
  const [data,   setData]   = useState<any>(null);
  const [loading,setLoading]= useState(true);
  const [tab,    setTab]    = useState<'overview'|'classwise'|'genderwise'|'crossTab'|'students'>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter,  setClassFilter]  = useState('');
  const [toast,  setToast]  = useState('');
  const chartsRef = useRef<Record<string, any>>({});
  const toastRef  = useRef<any>();

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      if (!d.user) { router.push('/school/login'); return; }
      setUser(d.user);
    });
  }, [router]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res  = await authFetch(`${BACKEND}/api/school/dashboard`);
      if (res.status === 401) { router.push('/school/login'); return; }
      if (res.status === 403) { showToast('Access denied'); return; }
      const json = await res.json();
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
    toastRef.current = setTimeout(() => setToast(''), 3500);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/school/login');
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  function dc(id: string) {
    if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; }
  }

  useEffect(() => {
    if (!data || !(window as any).Chart) return;
    const C = (window as any).Chart;

    if (tab === 'overview') {
      // Daily registrations bar chart
      dc('daily');
      const daily = data.daily as Record<string, { total: number; paid: number }>;
      const labels = Object.keys(daily).map(d => {
        const dt = new Date(d);
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      });
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

      // Payment status doughnut
      dc('status');
      const stats = data.stats;
      const colorMap: Record<string, string> = { paid:'#10b981', pending:'#f59e0b', failed:'#ef4444', cancelled:'#94a3b8' };
      const sLabels = ['paid','pending','failed','cancelled'];
      const sValues = [stats.paid, stats.pending, stats.failed, stats.total - stats.paid - stats.pending - stats.failed];
      const ctx2 = (document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
      if (ctx2) chartsRef.current.status = new C(ctx2, {
        type: 'doughnut',
        data: { labels:sLabels, datasets:[{ data:sValues, backgroundColor:sLabels.map(l=>colorMap[l]??'#94a3b8'), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'65%' },
      });
    }

    if (tab === 'classwise') {
      dc('classPie');
      dc('classBar');
      const byClass = data.byClass as Record<string, { total:number; paid:number; unpaid:number }>;
      const cls = Object.keys(byClass).sort();
      const COLORS = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#84cc16','#14b8a6'];
      const ctx3 = (document.getElementById('classPie') as HTMLCanvasElement)?.getContext('2d');
      if (ctx3) chartsRef.current.classPie = new C(ctx3, {
        type: 'doughnut',
        data: { labels:cls, datasets:[{ data:cls.map(c=>byClass[c].total), backgroundColor:cls.map((_,i)=>COLORS[i%COLORS.length]), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right' } }, cutout:'55%' },
      });
      const ctx4 = (document.getElementById('classBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx4) chartsRef.current.classBar = new C(ctx4, {
        type: 'bar',
        data: {
          labels: cls,
          datasets: [
            { label:'Paid',       data:cls.map(c=>byClass[c].paid),   backgroundColor:'rgba(16,185,129,.8)', borderRadius:6, borderSkipped:false },
            { label:'Not Paid',   data:cls.map(c=>byClass[c].unpaid), backgroundColor:'rgba(239,68,68,.7)',  borderRadius:6, borderSkipped:false },
          ],
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ x:{ stacked:true, grid:{display:false} }, y:{ stacked:true, beginAtZero:true } } },
      });
    }

    if (tab === 'genderwise') {
      dc('genderPie');
      dc('genderBar');
      const byGender = data.byGender as Record<string, { total:number; paid:number }>;
      const genders  = Object.keys(byGender);
      const GC: Record<string, string> = { Male:'#4f46e5', Female:'#ec4899', Other:'#10b981', Unknown:'#94a3b8' };
      const ctx5 = (document.getElementById('genderPie') as HTMLCanvasElement)?.getContext('2d');
      if (ctx5) chartsRef.current.genderPie = new C(ctx5, {
        type: 'doughnut',
        data: { labels:genders, datasets:[{ data:genders.map(g=>byGender[g].total), backgroundColor:genders.map(g=>GC[g]??'#94a3b8'), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right' } }, cutout:'55%' },
      });
      const ctx6 = (document.getElementById('genderBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx6) chartsRef.current.genderBar = new C(ctx6, {
        type: 'bar',
        data: {
          labels: genders,
          datasets: [
            { label:'Paid',     data:genders.map(g=>byGender[g].paid),                        backgroundColor:'rgba(16,185,129,.8)', borderRadius:6 },
            { label:'Not Paid', data:genders.map(g=>byGender[g].total-byGender[g].paid),       backgroundColor:'rgba(239,68,68,.7)',  borderRadius:6 },
          ],
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ x:{ grid:{display:false} }, y:{ beginAtZero:true } } },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const allRows: Row[] = data?.rows ?? [];
  const filteredRows = allRows.filter(r => {
    const s = search.toLowerCase();
    const matchSearch  = !s || [r.student_name, r.parent_name, r.contact_phone, r.contact_email, r.class_grade, r.gender].join(' ').toLowerCase().includes(s);
    const matchStatus  = !statusFilter || r.payment_status === statusFilter;
    const matchClass   = !classFilter  || r.class_grade   === classFilter;
    return matchSearch && matchStatus && matchClass;
  });

  const classes = [...new Set(allRows.map(r => r.class_grade).filter(Boolean))].sort();

  // ── Render ────────────────────────────────────────────────────────────────
  if (!user || loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:12}}>🏫</div>
        <p style={{color:'var(--m)',fontSize:14}}>Loading dashboard…</p>
      </div>
    </div>
  );

  const { stats, school, byClass, byGender, crossTab } = data ?? {};

  const TABS = [
    { id:'overview',   icon:'🏠', label:'Overview'      },
    { id:'classwise',  icon:'📚', label:'Class-wise'    },
    { id:'genderwise', icon:'👫', label:'Gender-wise'   },
    { id:'crossTab',   icon:'📊', label:'Class × Gender'},
    { id:'students',   icon:'👨‍🎓', label:'All Students'  },
  ] as const;

  return (
    <>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" async />

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,
                     padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <header style={{background:'var(--card)',borderBottom:'1.5px solid var(--bd)',padding:'0 24px',
                        display:'flex',alignItems:'center',justifyContent:'space-between',height:60,
                        position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:26}}>🏫</span>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:'var(--text)',lineHeight:1.2}}>
                {school?.name ?? 'School Dashboard'}
              </div>
              <div style={{fontSize:11,color:'var(--m)',lineHeight:1}}>
                {school?.org_name ?? ''}{school?.city ? ` · ${school.city}` : ''}
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <button onClick={load} style={{background:'var(--acc3)',color:'var(--acc)',border:'none',borderRadius:8,
                                           padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              🔄 Refresh
            </button>
            <button onClick={doLogout} style={{background:'var(--red2)',color:'var(--red)',border:'none',
                                               borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              Sign Out
            </button>
          </div>
        </header>

        <div style={{display:'flex',minHeight:'calc(100vh - 60px)'}}>

          {/* ── Sidebar tabs ──────────────────────────────────────── */}
          <aside style={{width:200,background:'var(--card)',borderRight:'1.5px solid var(--bd)',
                         padding:'20px 12px',flexShrink:0}}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  width:'100%',textAlign:'left',border:'none',borderRadius:10,
                  padding:'10px 12px',marginBottom:4,cursor:'pointer',fontSize:13,fontWeight:600,
                  display:'flex',alignItems:'center',gap:8,
                  background: tab===t.id ? 'var(--acc)' : 'transparent',
                  color:      tab===t.id ? '#fff'        : 'var(--text)',
                }}
              >
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </aside>

          {/* ── Main content ──────────────────────────────────────── */}
          <main style={{flex:1,padding:'24px',overflowY:'auto'}}>

            {/* ── OVERVIEW ─────────────────────────────────────────── */}
            {tab === 'overview' && (
              <div>
                <h2 style={{margin:'0 0 20px',fontSize:22,fontWeight:800,color:'var(--text)'}}>
                  Overview
                  <span style={{fontSize:13,fontWeight:500,color:'var(--m)',marginLeft:12}}>
                    {school?.name}
                  </span>
                </h2>

                {/* Stat cards */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16,marginBottom:24}}>
                  <StatCard icon="👨‍🎓" label="Total Registered"  value={stats?.total    ?? 0} color="var(--acc)" />
                  <StatCard icon="✅" label="Paid"               value={stats?.paid     ?? 0} color="#10b981"    sub={`₹${fmtR(stats?.totalRev ?? 0)} collected`} />
                  <StatCard icon="⏳" label="Not Paid"           value={stats?.unpaid   ?? 0} color="#f59e0b"    />
                  <StatCard icon="❌" label="Failed / Cancelled" value={stats?.failed   ?? 0} color="#ef4444"    />
                  <StatCard icon="💰" label="Total Revenue"      value={`₹${fmtR(stats?.totalRev ?? 0)}`} color="#8b5cf6" />
                  <StatCard icon="📈" label="Conversion"
                    value={stats?.total ? `${Math.round((stats.paid/stats.total)*100)}%` : '—'}
                    color="#06b6d4"
                  />
                </div>

                {/* Charts */}
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>📅 Daily Registrations (Last 30 days)</div>
                    <div style={{height:260}}><canvas id="chartDaily"/></div>
                  </div>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>💳 Payment Status</div>
                    <div style={{height:260}}><canvas id="chartStatus"/></div>
                  </div>
                </div>
              </div>
            )}

            {/* ── CLASS-WISE ───────────────────────────────────────── */}
            {tab === 'classwise' && (
              <div>
                <h2 style={{margin:'0 0 20px',fontSize:22,fontWeight:800,color:'var(--text)'}}>Class-wise Breakdown</h2>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Students per Class</div>
                    <div style={{height:300}}><canvas id="classPie"/></div>
                  </div>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Paid vs Not Paid by Class</div>
                    <div style={{height:300}}><canvas id="classBar"/></div>
                  </div>
                </div>

                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Class Summary Table</div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid var(--bd)'}}>
                        {['Class','Total','Paid','Not Paid','Payment Rate'].map(h => (
                          <th key={h} style={{textAlign:'left',padding:'8px 12px',color:'var(--m)',fontWeight:600,fontSize:12}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byClass && Object.keys(byClass).sort().map(cls => {
                        const { total, paid, unpaid } = byClass[cls];
                        const rate = total ? Math.round((paid/total)*100) : 0;
                        return (
                          <tr key={cls} style={{borderBottom:'1px solid var(--bd)'}}>
                            <td style={{padding:'10px 12px',fontWeight:700,color:'var(--acc)'}}>{cls}</td>
                            <td style={{padding:'10px 12px'}}>{total}</td>
                            <td style={{padding:'10px 12px',color:'#10b981',fontWeight:600}}>{paid}</td>
                            <td style={{padding:'10px 12px',color:'#ef4444',fontWeight:600}}>{unpaid}</td>
                            <td style={{padding:'10px 12px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{flex:1,height:6,background:'var(--bd)',borderRadius:3,overflow:'hidden'}}>
                                  <div style={{width:`${rate}%`,height:'100%',background:'#10b981',borderRadius:3}}/>
                                </div>
                                <span style={{fontWeight:700,fontSize:12}}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── GENDER-WISE ──────────────────────────────────────── */}
            {tab === 'genderwise' && (
              <div>
                <h2 style={{margin:'0 0 20px',fontSize:22,fontWeight:800,color:'var(--text)'}}>Gender-wise Breakdown</h2>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Gender Distribution</div>
                    <div style={{height:300}}><canvas id="genderPie"/></div>
                  </div>
                  <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Paid vs Not Paid by Gender</div>
                    <div style={{height:300}}><canvas id="genderBar"/></div>
                  </div>
                </div>

                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'var(--text)'}}>Gender Summary</div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid var(--bd)'}}>
                        {['Gender','Total','Paid','Not Paid','Payment Rate'].map(h => (
                          <th key={h} style={{textAlign:'left',padding:'8px 12px',color:'var(--m)',fontWeight:600,fontSize:12}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byGender && Object.entries(byGender).map(([gender, vals]: any) => {
                        const rate = vals.total ? Math.round((vals.paid/vals.total)*100) : 0;
                        return (
                          <tr key={gender} style={{borderBottom:'1px solid var(--bd)'}}>
                            <td style={{padding:'10px 12px',fontWeight:700}}>{gender}</td>
                            <td style={{padding:'10px 12px'}}>{vals.total}</td>
                            <td style={{padding:'10px 12px',color:'#10b981',fontWeight:600}}>{vals.paid}</td>
                            <td style={{padding:'10px 12px',color:'#ef4444',fontWeight:600}}>{vals.total - vals.paid}</td>
                            <td style={{padding:'10px 12px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{flex:1,height:6,background:'var(--bd)',borderRadius:3,overflow:'hidden'}}>
                                  <div style={{width:`${rate}%`,height:'100%',background:'#10b981',borderRadius:3}}/>
                                </div>
                                <span style={{fontWeight:700,fontSize:12}}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CLASS × GENDER ───────────────────────────────────── */}
            {tab === 'crossTab' && (
              <div>
                <h2 style={{margin:'0 0 20px',fontSize:22,fontWeight:800,color:'var(--text)'}}>Class × Gender Breakdown</h2>
                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:20,overflowX:'auto'}}>
                  {crossTab && (() => {
                    const sortedClasses = Object.keys(crossTab).sort();
                    const allGenders    = [...new Set(sortedClasses.flatMap(c => Object.keys(crossTab[c])))].sort();
                    return (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid var(--bd)'}}>
                            <th style={{textAlign:'left',padding:'8px 12px',color:'var(--m)',fontWeight:600,fontSize:12}}>Class</th>
                            {allGenders.map(g => (
                              <th key={g} style={{textAlign:'center',padding:'8px 12px',color:'var(--m)',fontWeight:600,fontSize:12}}>{g}</th>
                            ))}
                            <th style={{textAlign:'center',padding:'8px 12px',color:'var(--m)',fontWeight:600,fontSize:12}}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedClasses.map(cls => {
                            const rowData = crossTab[cls];
                            const rowTotal: number = (Object.values(rowData) as number[]).reduce((s: number, v) => s + (Number(v) || 0), 0);
                            return (
                              <tr key={cls} style={{borderBottom:'1px solid var(--bd)'}}>
                                <td style={{padding:'10px 12px',fontWeight:700,color:'var(--acc)'}}>{cls}</td>
                                {allGenders.map(g => (
                                  <td key={g} style={{padding:'10px 12px',textAlign:'center',fontWeight: rowData[g] ? 600 : 400, color: rowData[g] ? 'var(--text)' : 'var(--m)'}}>
                                    {Number(rowData[g] ?? 0)}
                                  </td>
                                ))}
                                <td style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'var(--acc)'}}>{rowTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:'2px solid var(--bd)',background:'var(--acc3)'}}>
                            <td style={{padding:'10px 12px',fontWeight:800,color:'var(--text)'}}>Total</td>
                            {allGenders.map(g => {
                              const colTotal = sortedClasses.reduce((s, c) => s + (Number(crossTab[c][g]) || 0), 0);
                              return <td key={g} style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'var(--text)'}}>{colTotal}</td>;
                            })}
                            <td style={{padding:'10px 12px',textAlign:'center',fontWeight:800,color:'var(--acc)'}}>
                              {sortedClasses.reduce((s: number, c) => s + Number(Object.values(crossTab[c]).reduce((ss: number, v) => ss + (Number(v) || 0), 0)), 0)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── ALL STUDENTS ─────────────────────────────────────── */}
            {tab === 'students' && (
              <div>
                <h2 style={{margin:'0 0 16px',fontSize:22,fontWeight:800,color:'var(--text)'}}>
                  All Students
                  <span style={{fontSize:13,fontWeight:500,color:'var(--m)',marginLeft:12}}>
                    {filteredRows.length} of {allRows.length} shown
                  </span>
                </h2>

                {/* Filters */}
                <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
                  <input
                    placeholder="Search name, phone, email…"
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{flex:1,minWidth:200,border:'1.5px solid var(--bd)',borderRadius:10,
                            padding:'9px 14px',fontSize:13,fontFamily:'DM Sans,sans-serif',
                            outline:'none',color:'var(--text)',background:'var(--card)'}}
                  />
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{border:'1.5px solid var(--bd)',borderRadius:10,padding:'9px 14px',fontSize:13,
                            fontFamily:'DM Sans,sans-serif',outline:'none',color:'var(--text)',background:'var(--card)'}}>
                    <option value="">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="initiated">Initiated</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                    style={{border:'1.5px solid var(--bd)',borderRadius:10,padding:'9px 14px',fontSize:13,
                            fontFamily:'DM Sans,sans-serif',outline:'none',color:'var(--text)',background:'var(--card)'}}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,overflow:'hidden'}}>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead>
                        <tr style={{background:'var(--acc3)',borderBottom:'2px solid var(--bd)'}}>
                          {['Date','Student','Class','Gender','Parent','Phone','Program','Amount','Status'].map(h => (
                            <th key={h} style={{textAlign:'left',padding:'10px 14px',color:'var(--m)',fontWeight:600,fontSize:11,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr><td colSpan={9} style={{padding:'40px',textAlign:'center',color:'var(--m)'}}>No students match your filters</td></tr>
                        ) : filteredRows.map(r => (
                          <tr key={r.id} style={{borderBottom:'1px solid var(--bd)'}}>
                            <td style={{padding:'10px 14px',color:'var(--m)',fontSize:11,whiteSpace:'nowrap'}}>{r.created_at?.slice(0,10)}</td>
                            <td style={{padding:'10px 14px',fontWeight:700,whiteSpace:'nowrap'}}>{r.student_name}</td>
                            <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>{r.class_grade}</td>
                            <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>{r.gender}</td>
                            <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>{r.parent_name}</td>
                            <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>
                              <a href={`tel:${r.contact_phone}`} style={{color:'var(--acc)',fontWeight:600,textDecoration:'none'}}>{r.contact_phone}</a>
                            </td>
                            <td style={{padding:'10px 14px',fontSize:11,color:'var(--m)',whiteSpace:'nowrap'}}>{r.program_name ?? '—'}</td>
                            <td style={{padding:'10px 14px',fontWeight:700,whiteSpace:'nowrap'}}>
                              {r.payment_status === 'paid' ? `₹${fmtR(r.final_amount)}` : '—'}
                            </td>
                            <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}><Badge status={r.payment_status ?? 'pending'}/></td>
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
