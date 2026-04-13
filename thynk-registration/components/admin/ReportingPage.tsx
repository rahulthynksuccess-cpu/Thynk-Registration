'use client';
// ReportingPage.tsx  — Drop-in replacement for the inline ReportingPage function in admin/page.tsx
// Usage: import { ReportingPage } from '@/components/admin/ReportingPage';

import React, { useState, useEffect, useRef } from 'react';

type Row = Record<string, any>;

const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtA = (p: number) => fmt(p / 100);

const TIMELINE_OPTIONS = [
  { label: 'Today',        days: 0  },
  { label: 'Last 5 Days',  days: 5  },
  { label: 'Last 10 Days', days: 10 },
  { label: 'Last 15 Days', days: 15 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Current Year', days: -1 },
];

function filterByTimeline(rows: Row[], days: number): Row[] {
  if (days === -1) { const y = new Date().getFullYear(); return rows.filter(r => new Date(r.created_at).getFullYear() === y); }
  if (days === 0)  { const t = new Date().toISOString().slice(0,10); return rows.filter(r => r.created_at?.slice(0,10) === t); }
  const cut = new Date(Date.now() - days * 86400000);
  return rows.filter(r => new Date(r.created_at) >= cut);
}

function getSchoolName(r: Row): string { return r.school_name ?? r.parent_school ?? ''; }

const COUNTRY_EMOJI: Record<string,string> = { India:'🇮🇳','United Arab Emirates':'🇦🇪','Saudi Arabia':'🇸🇦',Kuwait:'🇰🇼',Qatar:'🇶🇦',Bahrain:'🇧🇭',Oman:'🇴🇲',Singapore:'🇸🇬',Malaysia:'🇲🇾',Indonesia:'🇮🇩',Thailand:'🇹🇭',Philippines:'🇵🇭',Nepal:'🇳🇵',Bangladesh:'🇧🇩','Sri Lanka':'🇱🇰' };
const GW_COLORS: Record<string,string>     = { razorpay:'#4f46e5', cashfree:'#10b981', easebuzz:'#f59e0b', paypal:'#0070ba', stripe:'#635bff' };
const PALETTE = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#84cc16','#14b8a6'];
const RANK_COLORS = ['#FFD700','#C0C0C0','#CD7F32',...Array(7).fill('#4f46e5')];

// ── Reusable chart card ─────────────────────────────────────────────
function ChartCard({ title, note, children, tall }: { title:string; note?:string; children:React.ReactNode; tall?:boolean }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div style={{ width:3, height:16, background:'var(--acc)', borderRadius:2 }} />
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{title}</span>
        {note && <span style={{ fontSize:10, background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:20, fontWeight:600, marginLeft:'auto' }}>{note}</span>}
      </div>
      <div style={{ height: tall ? 320 : 240, position:'relative' }}>{children}</div>
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────
function KPI({ icon, label, val, sub, color = 'var(--acc)' }: { icon:string; label:string; val:any; sub?:string; color?:string }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'18px 20px', flex:1, minWidth:140 }}>
      <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, fontFamily:'Sora', color }}>{val}</div>
      {sub && <div style={{ fontSize:11, color:'var(--m)', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────
function Section({ title, note, children }: { title:string; note?:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ width:3, height:16, background:'var(--acc)', borderRadius:2, flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.07em' }}>{title}</span>
        {note && <span style={{ fontSize:10, background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:20, fontWeight:600, letterSpacing:'.03em' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Horizontal stacked bar (pure CSS, no chart.js) ─────────────────
function StackedBar({ paid, total, maxTotal }: { paid:number; total:number; maxTotal:number }) {
  const unpaid  = total - paid;
  const barW    = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%' }}>
      <div style={{ flex:1, height:10, borderRadius:5, background:'var(--bd)', overflow:'hidden', position:'relative' }}>
        <div style={{ width:`${barW}%`, height:'100%', borderRadius:5, background:'rgba(239,68,68,0.3)', position:'absolute', left:0 }} />
        <div style={{ width:`${barW * paidPct / 100}%`, height:'100%', borderRadius:5, background:'#10b981', position:'absolute', left:0 }} />
      </div>
    </div>
  );
}

// ── Chart.js canvas wrapper ────────────────────────────────────────
function CJSCanvas({ id }: { id:string }) {
  return <canvas id={id} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
export function ReportingPage({ allRows, programs, schools }: { allRows: Row[]; programs: Row[]; schools: Row[] }) {
  const [timelineDays,  setTimelineDays]  = useState(-1);
  const [filterProgram, setFilterProgram] = useState('');
  const [activeSection, setActiveSection] = useState<'overview'|'schools'|'classes'|'gender'|'payment'>('overview');
  const chartsRef = useRef<Record<string,any>>({});

  const base     = filterProgram ? allRows.filter(r => r.program_name === filterProgram) : allRows;
  const rows     = filterByTimeline(base, timelineDays);
  const paidRows = rows.filter(r => r.payment_status === 'paid');

  const totalSchools   = schools.length;
  const activeSchools  = schools.filter(s => s.is_active !== false).length;
  const countrySet     = [...new Set(schools.map(s => s.country ?? 'India').filter(Boolean))];
  const totalCountries = countrySet.length;

  const inrPaid  = paidRows.filter(r => !r.country || r.country === 'India');
  const usdPaid  = paidRows.filter(r => r.country && r.country !== 'India');
  const inrRev   = inrPaid.reduce((a, r) => a + (r.final_amount ?? 0), 0);
  const usdRev   = usdPaid.reduce((a, r) => a + (r.final_amount ?? 0), 0);
  const totalRev = paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0);

  const classSet   = [...new Set(paidRows.map(r => r.class_grade).filter(Boolean))].sort();
  const classStats = classSet.map(c => {
    const cr = paidRows.filter(r => r.class_grade === c);
    return { cls: c, total: cr.length };
  });

  const genderStats = ['Male','Female','Other'].map(g => ({ gender: g, total: paidRows.filter(r => r.gender === g).length })).filter(g => g.total > 0);
  const unknownGender = paidRows.filter(r => !['Male','Female','Other'].includes(r.gender)).length;

  const gatewaySet   = [...new Set(rows.map(r => r.gateway).filter(Boolean))];
  const gatewayStats = gatewaySet.map(g => {
    const all  = rows.filter(r => r.gateway === g);
    const paid = all.filter(r => r.payment_status === 'paid');
    return { gw: g, gateway: g, attempts: all.length, paid: paid.length, rev: paid.reduce((a, r) => a + (r.final_amount ?? 0), 0) };
  }).sort((a, b) => b.paid - a.paid);

  const allSchoolNames    = [...new Set(paidRows.map(r => getSchoolName(r)).filter(Boolean))];
  const topRevenueSchools = allSchoolNames.map(s => { const sr = paidRows.filter(r => getSchoolName(r) === s); const country = sr[0]?.country ?? 'India'; return { name:s, students:sr.length, rev:sr.reduce((a,r)=>a+(r.final_amount??0),0), country }; }).sort((a,b)=>b.rev-a.rev).slice(0,10);
  const topStudentSchools = allSchoolNames.map(s => { const sr = paidRows.filter(r => getSchoolName(r) === s); const country = sr[0]?.country ?? 'India'; return { name:s, students:sr.length, rev:sr.reduce((a,r)=>a+(r.final_amount??0),0), country }; }).sort((a,b)=>b.students-a.students).slice(0,10);

  const countryStats = countrySet.map(c => {
    const cr  = paidRows.filter(r => (r.country ?? 'India') === c);
    const sc  = [...new Set(cr.map(r => getSchoolName(r)).filter(Boolean))];
    return { country:c, schools:sc.length, students:cr.length, rev:cr.reduce((a,r)=>a+(r.final_amount??0),0) };
  }).filter(c => c.students > 0).sort((a,b)=>b.students-a.students);

  // Gender-by-class stats
  const genderClassStats = classSet.map(c => {
    const cr = paidRows.filter(r => r.class_grade === c);
    const byG: Record<string,number> = {};
    ['Male','Female','Other'].forEach(g => { byG[g] = cr.filter(r => r.gender === g).length; });
    return { cls:c, total:cr.length, byGender:byG };
  });

  // ── Draw all Chart.js charts ──────────────────────────────────────
  function dc(id:string) { if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; } }

  useEffect(() => {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;

    // ── Registration funnel (overview) ─────────────────────────────
    if (activeSection === 'overview') {
      // Revenue by gateway doughnut
      dc('gwRevDoughnut');
      const ctx1 = (document.getElementById('gwRevDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx1 && gatewayStats.length) {
        chartsRef.current.gwRevDoughnut = new C(ctx1, {
          type:'doughnut',
          data:{ labels:gatewayStats.map(g=>g.gw), datasets:[{ data:gatewayStats.map(g=>g.rev/100), backgroundColor:gatewayStats.map(g=>GW_COLORS[g.gw]??'#94a3b8'), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'60%' },
        });
      }
      // INR vs USD doughnut
      dc('currencyDoughnut');
      const ctx2 = (document.getElementById('currencyDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx2) {
        chartsRef.current.currencyDoughnut = new C(ctx2, {
          type:'doughnut',
          data:{ labels:['INR','USD'], datasets:[{ data:[inrRev/100, usdRev/100], backgroundColor:['#4f46e5','#22c55e'], borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'60%' },
        });
      }
      // Payment status bar
      dc('statusBar');
      const ctx3 = (document.getElementById('statusBar') as HTMLCanvasElement)?.getContext('2d');
      const statusGroups = ['paid','initiated','pending','failed','cancelled'];
      const statusCounts = statusGroups.map(s => rows.filter(r => r.payment_status === s).length);
      const statusColors  = ['#10b981','#4f46e5','#f59e0b','#ef4444','#94a3b8'];
      if (ctx3) {
        chartsRef.current.statusBar = new C(ctx3, {
          type:'bar',
          data:{ labels:statusGroups, datasets:[{ data:statusCounts, backgroundColor:statusColors, borderRadius:8, borderSkipped:false }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } }, x:{ grid:{ display:false } } } },
        });
      }
    }

    // ── School charts ──────────────────────────────────────────────
    if (activeSection === 'schools') {
      dc('countryBar');
      const ctx4 = (document.getElementById('countryBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx4 && countryStats.length) {
        chartsRef.current.countryBar = new C(ctx4, {
          type:'bar',
          data:{
            labels:countryStats.map(c=>`${COUNTRY_EMOJI[c.country]??'🌍'} ${c.country}`),
            datasets:[
              { label:'Students', data:countryStats.map(c=>c.students), backgroundColor:'rgba(16,185,129,.8)', borderRadius:6 },
              { label:'Schools',  data:countryStats.map(c=>c.schools),  backgroundColor:'rgba(79,70,229,.6)',  borderRadius:6 },
            ],
          },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ y:{ beginAtZero:true }, x:{ grid:{ display:false } } } },
        });
      }
      dc('revByCountry');
      const ctx5 = (document.getElementById('revByCountry') as HTMLCanvasElement)?.getContext('2d');
      if (ctx5 && countryStats.length) {
        chartsRef.current.revByCountry = new C(ctx5, {
          type:'bar',
          data:{
            labels:countryStats.map(c=>`${COUNTRY_EMOJI[c.country]??'🌍'} ${c.country}`),
            datasets:[{ label:'Revenue', data:countryStats.map(c=>c.rev/100), backgroundColor:countryStats.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'), borderRadius:6 }],
          },
          options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true, ticks:{ callback:(v:number)=>'₹'+fmt(v) } }, y:{ grid:{ display:false } } } },
        });
      }
    }

    // ── Class charts ───────────────────────────────────────────────
    if (activeSection === 'classes') {
      dc('classDoughnut');
      const ctx6 = (document.getElementById('classDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx6 && classStats.length) {
        chartsRef.current.classDoughnut = new C(ctx6, {
          type:'doughnut',
          data:{ labels:classStats.map(c=>c.cls), datasets:[{ data:classStats.map(c=>c.total), backgroundColor:classStats.map((_,i)=>PALETTE[i%PALETTE.length]), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right' } }, cutout:'50%' },
        });
      }
      dc('classGenderBar');
      const ctx7 = (document.getElementById('classGenderBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx7 && genderClassStats.length) {
        chartsRef.current.classGenderBar = new C(ctx7, {
          type:'bar',
          data:{
            labels: genderClassStats.map(c=>c.cls),
            datasets:[
              { label:'Male',   data:genderClassStats.map(c=>c.byGender.Male??0),   backgroundColor:'rgba(37,99,235,0.75)',  borderRadius:5 },
              { label:'Female', data:genderClassStats.map(c=>c.byGender.Female??0), backgroundColor:'rgba(219,39,119,0.75)', borderRadius:5 },
              { label:'Other',  data:genderClassStats.map(c=>c.byGender.Other??0),  backgroundColor:'rgba(124,58,237,0.75)', borderRadius:5 },
            ],
          },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true } } },
        });
      }
    }

    // ── Gender charts ──────────────────────────────────────────────
    if (activeSection === 'gender') {
      dc('genderDoughnut');
      const allWithUnknown = [...genderStats, ...(unknownGender > 0 ? [{ gender:'Unknown', total:unknownGender }] : [])];
      const GC: Record<string,string> = { Male:'#2563eb', Female:'#db2777', Other:'#7c3aed', Unknown:'#94a3b8' };
      const ctx8 = (document.getElementById('genderDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx8 && allWithUnknown.length) {
        chartsRef.current.genderDoughnut = new C(ctx8, {
          type:'doughnut',
          data:{ labels:allWithUnknown.map(g=>g.gender), datasets:[{ data:allWithUnknown.map(g=>g.total), backgroundColor:allWithUnknown.map(g=>GC[g.gender]??'#94a3b8'), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'55%' },
        });
      }
      dc('genderBarHoriz');
      const ctx9 = (document.getElementById('genderBarHoriz') as HTMLCanvasElement)?.getContext('2d');
      if (ctx9 && allWithUnknown.length) {
        chartsRef.current.genderBarHoriz = new C(ctx9, {
          type:'bar',
          data:{ labels:allWithUnknown.map(g=>g.gender), datasets:[{ data:allWithUnknown.map(g=>g.total), backgroundColor:allWithUnknown.map(g=>GC[g.gender]??'#94a3b8'), borderRadius:8, borderSkipped:false }] },
          options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true }, y:{ grid:{ display:false } } } },
        });
      }
    }

    // ── Payment charts ─────────────────────────────────────────────
    if (activeSection === 'payment') {
      dc('gwBar');
      const ctx10 = (document.getElementById('gwBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx10 && gatewayStats.length) {
        chartsRef.current.gwBar = new C(ctx10, {
          type:'bar',
          data:{
            labels:gatewayStats.map(g=>g.gw),
            datasets:[
              { label:'Paid',     data:gatewayStats.map(g=>g.paid),               backgroundColor:'rgba(16,185,129,.8)', borderRadius:6 },
              { label:'Attempts', data:gatewayStats.map(g=>g.attempts-g.paid),    backgroundColor:'rgba(239,68,68,.5)',  borderRadius:6 },
            ],
          },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true } } },
        });
      }
      dc('gwRevBar');
      const ctx11 = (document.getElementById('gwRevBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx11 && gatewayStats.length) {
        chartsRef.current.gwRevBar = new C(ctx11, {
          type:'bar',
          data:{
            labels:gatewayStats.map(g=>g.gw),
            datasets:[{ label:'Revenue', data:gatewayStats.map(g=>g.rev/100), backgroundColor:gatewayStats.map(g=>GW_COLORS[g.gw]??'#8b5cf6'), borderRadius:8 }],
          },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ callback:(v:number)=>'₹'+fmt(v) } }, x:{ grid:{ display:false } } } },
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, rows.length, filterProgram, timelineDays]);

  const SECTIONS = [
    { id:'overview', icon:'🏠', label:'Summary'    },
    { id:'schools',  icon:'🏫', label:'Schools'    },
    { id:'classes',  icon:'📚', label:'Classes'    },
    { id:'gender',   icon:'⚧',  label:'Gender'     },
    { id:'payment',  icon:'💳', label:'Payments'   },
  ] as const;

  const SS: React.CSSProperties = { border:'1.5px solid var(--bd)', borderRadius:10, padding:'7px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', cursor:'pointer' };

  return (
    <div>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="topbar" style={{ marginBottom:20 }}>
        <div className="topbar-left">
          <h1>Reporting <span>Analytics</span></h1>
          <p>{totalSchools} schools · {paidRows.length.toLocaleString()} paid · ₹{fmtA(inrRev)}{usdRev > 0 ? ` + $${fmtA(usdRev)}` : ''}</p>
        </div>
        <div className="topbar-right" style={{ gap:10 }}>
          <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)} style={{ ...SS, minWidth:160 }}>
            <option value="">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ display:'flex', gap:4 }}>
            {TIMELINE_OPTIONS.map(opt => (
              <button key={opt.label} onClick={() => setTimelineDays(opt.days)} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:11, fontWeight:600, whiteSpace:'nowrap', background: timelineDays===opt.days ? 'var(--acc)' : 'transparent', borderColor: timelineDays===opt.days ? 'var(--acc)' : 'var(--bd)', color: timelineDays===opt.days ? '#fff' : 'var(--m)', transition:'all .12s' }}>{opt.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section nav ─────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, marginBottom:24, borderBottom:'2px solid var(--bd)', paddingBottom:0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id as any)}
            style={{
              padding:'10px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
              background:'transparent', borderBottom:`3px solid ${activeSection===s.id ? 'var(--acc)' : 'transparent'}`,
              color: activeSection===s.id ? 'var(--acc)' : 'var(--m)', marginBottom:-2, transition:'all .12s',
              display:'flex', alignItems:'center', gap:6,
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SUMMARY                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeSection === 'overview' && (
        <div>
          {/* KPI row */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:24 }}>
            <KPI icon="🏫" label="Total Schools"     val={totalSchools}   color="var(--acc)"  sub={`${activeSchools} active`} />
            <KPI icon="🌍" label="Countries"          val={totalCountries} color="#8b5cf6"     sub="from school records" />
            <KPI icon="✅" label="Paid Students"      val={paidRows.length} color="#10b981"   sub={`of ${rows.length} total`} />
            <KPI icon="📚" label="Classes"            val={classSet.length} color="#06b6d4"   sub="unique grades (paid)" />
            <KPI icon="₹"  label="INR Collected"      val={`₹${fmtA(inrRev)}`}  color="#4f46e5" sub={`${inrPaid.length} txns`} />
            <KPI icon="$"  label="USD Collected"      val={`$${fmtA(usdRev)}`}  color="#22c55e" sub={`${usdPaid.length} txns`} />
          </div>

          {/* Chart row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:24 }}>
            <ChartCard title="💳 Payment Status Breakdown">
              <CJSCanvas id="statusBar" />
            </ChartCard>
            <ChartCard title="🏦 Revenue by Gateway">
              <CJSCanvas id="gwRevDoughnut" />
            </ChartCard>
            <ChartCard title="💱 INR vs USD Revenue">
              <CJSCanvas id="currencyDoughnut" />
            </ChartCard>
          </div>

          {/* Conversion funnel */}
          <Section title="Registration → Payment Funnel">
            {(() => {
              const total     = rows.length;
              const initiated = rows.filter(r => ['initiated','pending'].includes(r.payment_status)).length;
              const paid      = paidRows.length;
              const failed    = rows.filter(r => ['failed','cancelled'].includes(r.payment_status)).length;
              const steps = [
                { label:'Registered', val:total,     color:'#4f46e5', icon:'📋' },
                { label:'Initiated',  val:initiated, color:'#f59e0b', icon:'⏳' },
                { label:'Paid',       val:paid,      color:'#10b981', icon:'✅' },
                { label:'Failed',     val:failed,    color:'#ef4444', icon:'❌' },
              ];
              return (
                <div style={{ display:'flex', gap:10, alignItems:'stretch' }}>
                  {steps.map((s, i) => (
                    <React.Fragment key={s.label}>
                      <div style={{ flex:1, background:`${s.color}11`, border:`2px solid ${s.color}33`, borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
                        <div style={{ fontSize:28 }}>{s.icon}</div>
                        <div style={{ fontSize:32, fontWeight:800, fontFamily:'Sora', color:s.color, margin:'6px 0 4px' }}>{s.val}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--m)' }}>{s.label}</div>
                        {i > 0 && total > 0 && (
                          <div style={{ fontSize:11, color:s.color, fontWeight:700, marginTop:4 }}>
                            {Math.round(s.val / total * 100)}% of total
                          </div>
                        )}
                      </div>
                      {i < steps.length - 1 && (
                        <div style={{ display:'flex', alignItems:'center', color:'var(--m)', fontSize:20, flexShrink:0 }}>→</div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
          </Section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SCHOOLS                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeSection === 'schools' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
            <ChartCard title="🌍 Students & Schools by Country" tall>
              <CJSCanvas id="countryBar" />
            </ChartCard>
            <ChartCard title="💰 Revenue by Country" tall>
              <CJSCanvas id="revByCountry" />
            </ChartCard>
          </div>

          <Section title="Country-wise Table" note="Paid registrations only">
            {countryStats.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--m2)', fontSize:13 }}>No paid registrations</div>
              : (
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>Country</th><th>Schools</th><th>Paid Students</th><th>Revenue</th><th>Avg / Student</th></tr></thead>
                    <tbody>
                      {countryStats.map(c => (
                        <tr key={c.country}>
                          <td><span style={{ fontWeight:700 }}>{COUNTRY_EMOJI[c.country]??'🌍'} {c.country}</span></td>
                          <td><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{c.schools}</span></td>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ flex:1, height:6, borderRadius:3, background:'var(--bd)', overflow:'hidden', minWidth:60 }}>
                                <div style={{ width:`${Math.max(2, Math.round(c.students / Math.max(...countryStats.map(x=>x.students),1) * 100))}%`, height:'100%', background:'#06b6d4', borderRadius:3 }} />
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color:'#10b981' }}>{c.students}</span>
                            </div>
                          </td>
                          <td><span className="amt">{c.country === 'India' ? '₹' : '$'}{fmtA(c.rev)}</span></td>
                          <td style={{ color:'var(--m)', fontSize:12 }}>{c.country === 'India' ? '₹' : '$'}{c.students ? fmtA(Math.round(c.rev/c.students)) : '0'}</td>
                        </tr>
                      ))}
                      <tr style={{ background:'rgba(79,70,229,0.06)', fontWeight:800 }}>
                        <td style={{ fontWeight:800, color:'var(--acc)' }}>TOTAL</td>
                        <td><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{[...new Set(paidRows.map(r=>getSchoolName(r)).filter(Boolean))].length}</span></td>
                        <td><span style={{ color:'#10b981', fontWeight:800 }}>{paidRows.length}</span></td>
                        <td><span className="amt" style={{ fontWeight:800 }}>₹{fmtA(inrRev)}{usdRev > 0 && <span style={{marginLeft:6,color:'#22c55e',fontSize:'0.85em'}}> +${fmtA(usdRev)}</span>}</span></td>
                        <td style={{ color:'var(--m)', fontSize:12 }}>₹{inrPaid.length ? fmtA(Math.round(inrRev/inrPaid.length)) : '0'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
          </Section>

          {/* Top schools */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Section title="🏆 Top 10 Schools — Revenue" note="Paid only">
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {topRevenueSchools.map((s,i) => (
                  <div key={s.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background: i<3 ? `${RANK_COLORS[i]}0d` : 'transparent', border: i<3 ? `1px solid ${RANK_COLORS[i]}33` : '1px solid transparent' }}>
                    <span style={{ fontSize: i<3 ? 18 : 12, width:24, textAlign:'center', flexShrink:0, fontWeight:800, color:RANK_COLORS[i] }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.name}>{s.name}</div>
                      <div style={{ fontSize:10, color:'var(--m)' }}>{s.students} paid students</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:800, color:'#f59e0b', fontFamily:'Sora', flexShrink:0 }}>{!s.country || s.country === 'India' ? '₹' : '$'}{fmtA(s.rev)}</div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="🎓 Top 10 Schools — Students" note="Paid only">
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {topStudentSchools.map((s,i) => (
                  <div key={s.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background: i<3 ? `${RANK_COLORS[i]}0d` : 'transparent', border: i<3 ? `1px solid ${RANK_COLORS[i]}33` : '1px solid transparent' }}>
                    <span style={{ fontSize: i<3 ? 18 : 12, width:24, textAlign:'center', flexShrink:0, fontWeight:800, color:RANK_COLORS[i] }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.name}>{s.name}</div>
                      <div style={{ fontSize:10, color:'var(--m)' }}>{!s.country || s.country === 'India' ? '₹' : '$'}{fmtA(s.rev)}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:22, fontWeight:800, color:'#06b6d4', fontFamily:'Sora' }}>{s.students}</div>
                      <div style={{ fontSize:10, color:'var(--m)' }}>students</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CLASSES                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeSection === 'classes' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
            <ChartCard title="📚 Students per Class" tall>
              <CJSCanvas id="classDoughnut" />
            </ChartCard>
            <ChartCard title="⚧ Class × Gender (Stacked)" tall>
              <CJSCanvas id="classGenderBar" />
            </ChartCard>
          </div>

          <Section title="Class Summary Table" note="Paid registrations only">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Students</th>
                    <th>Male</th>
                    <th>Female</th>
                    <th>Other</th>
                    <th style={{ minWidth:120 }}>Share of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {genderClassStats.map(c => (
                    <tr key={c.cls}>
                      <td><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6, fontSize:12, fontWeight:700 }}>{c.cls}</span></td>
                      <td><span style={{ fontWeight:800, fontSize:15, color:'var(--text)' }}>{c.total}</span></td>
                      <td style={{ color:'#2563eb', fontWeight:700 }}>{c.byGender.Male||0}</td>
                      <td style={{ color:'#db2777', fontWeight:700 }}>{c.byGender.Female||0}</td>
                      <td style={{ color:'#7c3aed', fontWeight:700 }}>{c.byGender.Other||0}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:8, borderRadius:4, background:'var(--bd)', overflow:'hidden', minWidth:60 }}>
                            <div style={{ width:`${paidRows.length ? Math.round(c.total/paidRows.length*100) : 0}%`, height:'100%', background:'var(--acc)', borderRadius:4 }} />
                          </div>
                          <span style={{ fontWeight:700, fontSize:12, color:'var(--acc)' }}>{paidRows.length ? Math.round(c.total/paidRows.length*100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background:'rgba(79,70,229,0.06)', fontWeight:800 }}>
                    <td style={{ color:'var(--acc)', fontWeight:800 }}>TOTAL</td>
                    <td style={{ fontWeight:800, fontSize:15 }}>{paidRows.length}</td>
                    <td style={{ color:'#2563eb', fontWeight:800 }}>{genderClassStats.reduce((s,c)=>s+(c.byGender.Male||0),0)}</td>
                    <td style={{ color:'#db2777', fontWeight:800 }}>{genderClassStats.reduce((s,c)=>s+(c.byGender.Female||0),0)}</td>
                    <td style={{ color:'#7c3aed', fontWeight:800 }}>{genderClassStats.reduce((s,c)=>s+(c.byGender.Other||0),0)}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Country × Class matrix */}
          {(() => {
            const top5Countries = [...new Set(paidRows.map(r => r.country ?? 'India').filter(Boolean))]
              .map(c => ({ c, n: paidRows.filter(r => (r.country??'India') === c).length }))
              .sort((a,b) => b.n - a.n).slice(0,5).map(x => x.c);
            const matrix = classSet.map(cls => {
              const entry: Record<string,any> = { cls };
              top5Countries.forEach(c => { entry[c] = paidRows.filter(r => r.class_grade===cls && (r.country??'India')===c).length; });
              entry.total = paidRows.filter(r => r.class_grade===cls).length;
              return entry;
            });
            return (
              <Section title="Class × Country Matrix" note="Paid only">
                <div style={{ overflowX:'auto', background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:4 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'var(--m)', fontSize:11, borderBottom:'1.5px solid var(--bd)' }}>Class</th>
                        {top5Countries.map(c => <th key={c} style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'var(--m)', fontSize:11, borderBottom:'1.5px solid var(--bd)', whiteSpace:'nowrap' }}>{COUNTRY_EMOJI[c]??'🌍'} {c}</th>)}
                        <th style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'var(--acc)', fontSize:11, borderBottom:'1.5px solid var(--bd)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row,i) => (
                        <tr key={row.cls} style={{ background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom:'1px solid var(--bd)' }}>
                          <td style={{ padding:'9px 16px', fontWeight:700, color:'var(--acc)', fontSize:12 }}><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6 }}>{row.cls}</span></td>
                          {top5Countries.map(c => <td key={c} style={{ padding:'9px 14px', textAlign:'center', fontWeight: row[c]>0?700:400, color: row[c]>0?'var(--text)':'var(--m2)', fontSize:13 }}>{row[c]||'—'}</td>)}
                          <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:800, color:'var(--acc)', fontSize:14 }}>{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'rgba(79,70,229,0.06)', borderTop:'2px solid var(--bd)' }}>
                        <td style={{ padding:'9px 16px', fontWeight:800, color:'var(--m)', fontSize:11 }}>TOTAL</td>
                        {top5Countries.map(c => <td key={c} style={{ padding:'9px 14px', textAlign:'center', fontWeight:800, color:'var(--acc)', fontSize:13 }}>{paidRows.filter(r=>(r.country??'India')===c).length||'—'}</td>)}
                        <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:900, color:'var(--acc)', fontSize:15 }}>{paidRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>
            );
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* GENDER                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeSection === 'gender' && (
        <div>
          {/* Big gender pills */}
          <div style={{ display:'flex', gap:12, marginBottom:24 }}>
            {([...genderStats, ...(unknownGender > 0 ? [{ gender:'Unknown', total:unknownGender }] : [])]).map(g => {
              const GC: Record<string,{fg:string;bg:string;icon:string}> = { Male:{fg:'#2563eb',bg:'#eff6ff',icon:'👦'}, Female:{fg:'#db2777',bg:'#fdf2f8',icon:'👧'}, Other:{fg:'#7c3aed',bg:'#f5f3ff',icon:'🧑'}, Unknown:{fg:'#64748b',bg:'#f1f5f9',icon:'❓'} };
              const { fg, bg, icon } = GC[g.gender] ?? { fg:'#64748b', bg:'#f1f5f9', icon:'❓' };
              return (
                <div key={g.gender} style={{ flex:1, background:bg, border:`2px solid ${fg}33`, borderRadius:16, padding:'20px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:32 }}>{icon}</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--m)', marginTop:6 }}>{g.gender}</div>
                  <div style={{ fontSize:36, fontWeight:800, fontFamily:'Sora', color:fg, margin:'4px 0 2px' }}>{g.total}</div>
                  <div style={{ fontSize:11, color:'var(--m)' }}>{paidRows.length ? Math.round(g.total/paidRows.length*100) : 0}% of total</div>
                </div>
              );
            })}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
            <ChartCard title="⚧ Gender Distribution" tall>
              <CJSCanvas id="genderDoughnut" />
            </ChartCard>
            <ChartCard title="📊 Gender Count" tall>
              <CJSCanvas id="genderBarHoriz" />
            </ChartCard>
          </div>

          <Section title="Gender × Class Table" note="Paid only">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th style={{ color:'#2563eb' }}>👦 Male</th>
                    <th style={{ color:'#db2777' }}>👧 Female</th>
                    <th style={{ color:'#7c3aed' }}>🧑 Other</th>
                    <th>Total</th>
                    <th style={{ minWidth:140 }}>Gender Split</th>
                  </tr>
                </thead>
                <tbody>
                  {genderClassStats.map(c => {
                    const mPct = c.total > 0 ? Math.round(c.byGender.Male/c.total*100)   : 0;
                    const fPct = c.total > 0 ? Math.round(c.byGender.Female/c.total*100) : 0;
                    return (
                      <tr key={c.cls}>
                        <td><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6, fontSize:12, fontWeight:700 }}>{c.cls}</span></td>
                        <td style={{ color:'#2563eb', fontWeight:700 }}>{c.byGender.Male||0}</td>
                        <td style={{ color:'#db2777', fontWeight:700 }}>{c.byGender.Female||0}</td>
                        <td style={{ color:'#7c3aed', fontWeight:700 }}>{c.byGender.Other||0}</td>
                        <td style={{ fontWeight:800 }}>{c.total}</td>
                        <td>
                          <div style={{ display:'flex', height:8, borderRadius:4, overflow:'hidden', gap:1 }}>
                            <div style={{ width:`${mPct}%`, background:'#2563eb', borderRadius:'4px 0 0 4px' }} />
                            <div style={{ width:`${fPct}%`, background:'#db2777' }} />
                            <div style={{ flex:1, background:'rgba(124,58,237,0.4)', borderRadius:'0 4px 4px 0' }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PAYMENT                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeSection === 'payment' && (
        <div>
          {/* INR / USD tiles */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
            <div style={{ background:'var(--card)', border:'2px solid rgba(79,70,229,0.25)', borderRadius:14, padding:'20px 24px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', marginBottom:6 }}>🇮🇳 INR Collections</div>
              <div style={{ fontSize:32, fontWeight:800, fontFamily:'Sora', color:'var(--acc)' }}>₹{fmtA(inrRev)}</div>
              <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12, color:'var(--m)' }}>
                <span>{inrPaid.length} transactions</span>
                <span>Avg ₹{inrPaid.length ? fmtA(Math.round(inrRev/inrPaid.length)) : '0'}</span>
              </div>
            </div>
            <div style={{ background:'var(--card)', border:'2px solid rgba(34,197,94,0.25)', borderRadius:14, padding:'20px 24px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', marginBottom:6 }}>🌐 USD Collections</div>
              <div style={{ fontSize:32, fontWeight:800, fontFamily:'Sora', color:'#22c55e' }}>${fmtA(usdRev)}</div>
              <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12, color:'var(--m)' }}>
                <span>{usdPaid.length} transactions</span>
                <span>Avg ${usdPaid.length ? fmtA(Math.round(usdRev/usdPaid.length)) : '0'}</span>
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
            <ChartCard title="🏦 Gateway — Paid vs Attempts" tall>
              <CJSCanvas id="gwBar" />
            </ChartCard>
            <ChartCard title="💰 Revenue by Gateway" tall>
              <CJSCanvas id="gwRevBar" />
            </ChartCard>
          </div>

          <Section title="Payment Gateway Table" note="Attempts = all · Revenue = paid only">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Gateway</th><th>Attempts</th><th>Paid</th><th>Failed / Pending</th><th>Revenue</th><th>Conv%</th></tr></thead>
                <tbody>
                  {gatewayStats.length === 0
                    ? <tr><td colSpan={6} className="table-empty">No data</td></tr>
                    : gatewayStats.map(g => (
                      <tr key={g.gw}>
                        <td><span className="gw-tag">{g.gw}</span></td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ flex:1, background:'var(--bd)', borderRadius:3, height:6, overflow:'hidden', minWidth:60 }}>
                              <div style={{ width:`${Math.max(2, Math.round(g.attempts/Math.max(...gatewayStats.map(x=>x.attempts),1)*100))}%`, height:'100%', background:'var(--acc)', borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:12, fontWeight:700, minWidth:28 }}>{g.attempts}</span>
                          </div>
                        </td>
                        <td><span style={{ color:'#10b981', fontWeight:700 }}>{g.paid}</span></td>
                        <td style={{ color:'#ef4444', fontWeight:600 }}>{g.attempts - g.paid}</td>
                        <td><span className="amt">{g.gateway === 'paypal' ? '$' : '₹'}{fmtA(g.rev)}</span></td>
                        <td style={{ fontWeight:700 }}>{g.attempts ? Math.round(g.paid/g.attempts*100) : 0}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
