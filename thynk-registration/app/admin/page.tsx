'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const fmt  = (n: any) => { const v = parseFloat(String(n??0).replace(/[^0-9.]/g,'')); return isNaN(v)?'0':v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p/100);
type Row   = Record<string,any>;
const PALETTE = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];
const BACKEND  = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const NAV = [
  { section:'Analytics' },
  { id:'overview',      icon:'🏠', label:'Overview'       },
  { id:'students',      icon:'👨‍🎓', label:'Students'       },
  { id:'trends',        icon:'📈', label:'Trends'         },
  { section:'Actions' },
  { id:'followup',      icon:'📞', label:'Follow-Up',  badge:true },
  { id:'heatmap',       icon:'🗺️',  label:'City Heatmap'  },
  { id:'recent',        icon:'🕐', label:'Recent Activity'},
  { section:'Management' },
  { id:'programs',      icon:'🎯', label:'Programs'       },
  { id:'schools',       icon:'🏫', label:'Schools'        },
  { id:'discounts',     icon:'🏷️', label:'Discount Codes' },
  { id:'users',         icon:'👥', label:'Admin Users'    },
  { section:'Integrations' },
  { id:'integrations',  icon:'⚙️',  label:'Payment & Email'},
  { id:'triggers',      icon:'🔔', label:'Triggers'       },
  { id:'templates',     icon:'✉️',  label:'Message Templates'},
  { section:'Settings' },
  { id:'locations',     icon:'📍', label:'Location Master'  },
  { section:'Tools' },
  { id:'_export',       icon:'⬇️', label:'Export CSV', action:true },
  { id:'_refresh',      icon:'🔄', label:'Refresh',    action:true },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser]               = useState<any>(null);
  const [isSuperAdmin, setSuperAdmin] = useState(false);
  const [allRows, setAllRows]         = useState<Row[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activePage, setActivePage]   = useState('overview');
  const [lastUpdated, setLastUpdated] = useState('Loading...');
  const [toast, setToast]             = useState({ text:'', type:'' });
  const [modal, setModal]             = useState<Row|null>(null);
  const [drillData, setDrillData]     = useState<{title:string;rows:Row[]}|null>(null);
  const [trendDays, setTrendDays]     = useState(7);

  // Management state
  const [programs,     setPrograms]     = useState<Row[]>([]);
  const [schools,      setSchools]      = useState<Row[]>([]);
  const [discounts,    setDiscounts]    = useState<Row[]>([]);
  const [adminUsers,   setAdminUsers]   = useState<Row[]>([]);
  const [integrations, setIntegrations] = useState<Row[]>([]);
  const [triggers,     setTriggers]     = useState<Row[]>([]);
  const [templates,    setTemplates]    = useState<Row[]>([]);
  const [locations,    setLocations]    = useState<Row[]>([]);

  // Form modals
  const [programForm,     setProgramForm]     = useState<Row|null>(null);
  const [schoolForm,      setSchoolForm]      = useState<Row|null>(null);
  const [discountForm,    setDiscountForm]     = useState<Row|null>(null);
  const [userForm,        setUserForm]         = useState<Row|null>(null);
  const [integrationForm, setIntegrationForm] = useState<Row|null>(null);
  const [triggerForm,     setTriggerForm]     = useState<Row|null>(null);
  const [templateForm,    setTemplateForm]    = useState<Row|null>(null);

  const chartsRef  = useRef<Record<string,any>>({});
  const toastTimer = useRef<any>();

  // ── Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/admin/login'); return; }
      setUser(data.user);
      const supabase = createClient();
      const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', data.user.id).eq('role','super_admin').is('school_id',null).maybeSingle();
      setSuperAdmin(!!role);
    });
  }, [router]);

  // ── Loaders ──────────────────────────────────────────────────────
  const api = useCallback((path: string, opts?: RequestInit) =>
    fetch(`${BACKEND}${path}`, opts).then(r => r.json()), []);

  const loadRegistrations = useCallback(async () => {
    try {
      const data = await api('/api/admin/registrations?limit=1000');
      const rows = (data.rows??[]).filter((r:Row) => r.student_name?.trim());
      setAllRows(rows);
      setLastUpdated(`Last updated ${new Date().toLocaleTimeString('en-IN')} · ${rows.length} records`);
      showToast(`Loaded ${rows.length} records`, '✅');
    } catch(e:any) { showToast('Load error: '+e.message, '❌'); }
    finally { setLoading(false); }
  }, [api]);

  const loadPrograms     = useCallback(async () => { const d = await api('/api/admin/projects');     setPrograms(d.projects??[]); }, [api]);
  const loadSchools      = useCallback(async () => { const d = await api('/api/admin/schools');      setSchools(d.schools??[]); }, [api]);
  const loadDiscounts    = useCallback(async () => { const d = await api('/api/admin/discounts');    setDiscounts(d.discounts??[]); }, [api]);
  const loadUsers        = useCallback(async () => { const d = await api('/api/admin/users');        setAdminUsers(d.users??[]); }, [api]);
  const loadIntegrations = useCallback(async () => { const d = await api('/api/admin/integrations'); setIntegrations(d.integrations??[]); }, [api]);
  const loadTriggers     = useCallback(async () => { const d = await api('/api/admin/triggers');     setTriggers(d.triggers??[]); }, [api]);
  const loadTemplates    = useCallback(async () => { const d = await api('/api/admin/templates');    setTemplates(d.templates??[]); }, [api]);
  const loadLocations    = useCallback(async () => { const d = await api('/api/admin/location?type=all&includeInactive=true'); setLocations(d.locations??[]); }, [api]);

  useEffect(() => { if (!user) return; loadRegistrations(); const t = setInterval(loadRegistrations, 10*60*1000); return () => clearInterval(t); }, [user, loadRegistrations]);
  useEffect(() => {
    if (!user) return;
    if (activePage === 'programs')     loadPrograms();
    if (activePage === 'schools')      loadSchools();
    if (activePage === 'discounts')    loadDiscounts();
    if (activePage === 'users')        loadUsers();
    if (activePage === 'integrations') loadIntegrations();
    if (activePage === 'triggers')   { loadTriggers(); loadTemplates(); loadSchools(); }
    if (activePage === 'templates')    loadTemplates();
    if (activePage === 'locations')    loadLocations();
  }, [activePage, user]);

  function showToast(text:string, icon='') {
    setToast({ text:`${icon} ${text}`.trim(), type: icon==='✅'?'ok':icon==='❌'?'err':'' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast({text:'',type:''}), 3500);
  }

  async function doLogout() { await createClient().auth.signOut(); router.push('/admin/login'); }

  // ── Charts ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!allRows.length) return;
    if (activePage==='overview')  renderOverviewCharts();
    if (activePage==='trends')    renderTrendCharts();
    if (activePage==='analytics') renderAnalyticsCharts();
  }, [activePage, allRows, trendDays]);

  function dc(id:string) { if(chartsRef.current[id]){chartsRef.current[id].destroy();delete chartsRef.current[id];} }

  function renderOverviewCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;
    const paid = allRows.filter(r=>r.payment_status==='paid');
    const now  = new Date();
    dc('daily');
    const labels:string[]=[],paidArr:number[]=[],totalArr:number[]=[];
    for(let i=trendDays-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);labels.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);totalArr.push(day.length);paidArr.push(day.filter(r=>r.payment_status==='paid').length);}
    const ctxD=(document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if(ctxD) chartsRef.current.daily=new C(ctxD,{type:'bar',data:{labels,datasets:[{label:'Total',data:totalArr,backgroundColor:'rgba(79,70,229,.12)',borderColor:'#4f46e5',borderWidth:2,borderRadius:8,borderSkipped:false},{label:'Paid',data:paidArr,backgroundColor:'rgba(16,185,129,.8)',borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}}}});
    dc('status');
    const sc:Record<string,number>={};allRows.forEach(r=>{const s=r.payment_status??'unknown';sc[s]=(sc[s]??0)+1;});
    const colorMap:Record<string,string>={paid:'#10b981',initiated:'#4f46e5',pending:'#f59e0b',failed:'#ef4444',cancelled:'#94a3b8'};
    const ctxS=(document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if(ctxS){const sl=Object.keys(sc);chartsRef.current.status=new C(ctxS,{type:'doughnut',data:{labels:sl,datasets:[{data:Object.values(sc),backgroundColor:sl.map(l=>colorMap[l]??'#94a3b8'),borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},cutout:'65%'}});}
  }

  function renderTrendCharts() {
    if (!(window as any).Chart) return;
    const C=(window as any).Chart; const now=new Date();
    dc('trend');
    const tl:string[]=[],tt:number[]=[],tp:number[]=[],tr:number[]=[];
    for(let i=29;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);tl.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);tt.push(day.length);tp.push(day.filter(r=>r.payment_status==='paid').length);tr.push(day.filter(r=>r.payment_status==='paid').reduce((s:number,r:Row)=>s+(r.final_amount??0),0));}
    const ctxT=(document.getElementById('chartTrend') as HTMLCanvasElement)?.getContext('2d');
    if(ctxT) chartsRef.current.trend=new C(ctxT,{data:{labels:tl,datasets:[{type:'bar',label:'Total',data:tt,backgroundColor:'rgba(79,70,229,.1)',borderColor:'#4f46e5',borderWidth:1.5,borderRadius:6,yAxisID:'y'},{type:'bar',label:'Paid',data:tp,backgroundColor:'rgba(16,185,129,.7)',borderRadius:6,yAxisID:'y'},{type:'line',label:'Revenue',data:tr,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,.08)',borderWidth:2.5,pointRadius:3,fill:true,tension:.4,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,position:'left'},y2:{beginAtZero:true,position:'right',grid:{display:false},ticks:{callback:(v:number)=>'₹'+fmt(v/100)}},x:{grid:{display:false}}}}});
  }

  function renderAnalyticsCharts() {
    if (!(window as any).Chart) return;
    const C=(window as any).Chart;
    dc('gender');
    const gc:Record<string,number>={};allRows.forEach(r=>{const g=r.gender??'Unknown';gc[g]=(gc[g]??0)+1;});
    const ctxGe=(document.getElementById('chartGender') as HTMLCanvasElement)?.getContext('2d');
    if(ctxGe){const gl=Object.keys(gc);chartsRef.current.gender=new C(ctxGe,{type:'doughnut',data:{labels:gl,datasets:[{data:Object.values(gc),backgroundColor:['#4f46e5','#ec4899','#94a3b8'],borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},cutout:'60%'}});}
    dc('city');
    const cc:Record<string,number>={};allRows.forEach(r=>{const c=r.city??'Unknown';cc[c]=(cc[c]??0)+1;});
    const sc2=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const ctxCi=(document.getElementById('chartCity') as HTMLCanvasElement)?.getContext('2d');
    if(ctxCi) chartsRef.current.city=new C(ctxCi,{type:'bar',data:{labels:sc2.map(e=>e[0]),datasets:[{data:sc2.map(e=>e[1]),backgroundColor:'rgba(79,70,229,.7)',borderRadius:6,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true},y:{grid:{display:false}}}}});
  }

  function exportCSV() {
    const h=['Date','Student','Class','Gender','School','City','Parent','Phone','Email','Gateway','Status','Base','Discount Code','Discount Amt','Final','Txn ID','Program'];
    const rows=[h,...allRows.map(r=>[r.created_at?.slice(0,10),r.student_name,r.class_grade,r.gender,r.parent_school,r.city,r.parent_name,r.contact_phone,r.contact_email,r.gateway,r.payment_status,(r.base_amount??0)/100,r.discount_code,(r.discount_amount??0)/100,(r.final_amount??0)/100,r.gateway_txn_id,r.program_name])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`Thynk_${new Date().toISOString().slice(0,10)}.csv`;a.click();
    showToast('CSV exported!','✅');
  }

  function navAction(id:string) {
    if (id==='_export')  { exportCSV(); return; }
    if (id==='_refresh') { loadRegistrations(); return; }
    setActivePage(id);
  }

  const paid    = allRows.filter(r=>r.payment_status==='paid');
  const pending = allRows.filter(r=>['pending','initiated'].includes(r.payment_status));
  const failed  = allRows.filter(r=>['failed','cancelled'].includes(r.payment_status));
  const totalRev = paid.reduce((s,r)=>s+(r.final_amount??0),0);
  const conv = allRows.length ? Math.round(paid.length/allRows.length*100) : 0;
  const avg  = paid.length   ? Math.round(totalRev/paid.length)            : 0;
  const today    = new Date().toISOString().slice(0,10);
  const thisWeek = allRows.filter(r=>new Date(r.created_at)>=new Date(Date.now()-7*24*60*60*1000)).length;
  const followUpCount = allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status)).length;

  const saveForm = async (path:string, data:Row, onDone:()=>void, successMsg:string) => {
    const method = data.id ? 'PATCH' : 'POST';
    const res = await fetch(`${BACKEND}${path}`, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const r   = await res.json();
    if (!res.ok) { showToast(r.error ?? 'Error', '❌'); return; }
    showToast(successMsg, '✅');
    onDone();
  };

  if (!user) return null;

  return (
    <>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" async />
      <div id="admin-toast" className={`${toast.text?'show':''}${toast.type==='ok'?' tok':toast.type==='err'?' terr':''}`}>{toast.text}</div>

      <div className="admin-layout">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-logo-badge">
              <div className="sb-logo-icon">📊</div>
              <div><h3>Thynk Success</h3><span>Admin Panel</span></div>
            </div>
          </div>
          <nav className="sb-nav">
            {NAV.map((item,i) => {
              if ('section' in item) return <div key={i} className="sb-section">{item.section}</div>;
              const isActive = !item.action && activePage===item.id;
              return (
                <button key={item.id} className={`sb-item${isActive?' active':''}`} onClick={()=>navAction(item.id!)}>
                  <span className="icon">{item.icon}</span>{item.label}
                  {item.badge && followUpCount>0 && <span className="sb-badge">{followUpCount}</span>}
                </button>
              );
            })}
          </nav>
          <div className="sb-bottom">
            <div className="sb-user">
              <div className="sb-avatar">{user.email?.[0]?.toUpperCase()??'A'}</div>
              <div>
                <div className="sb-user-name">{user.email?.split('@')[0]}</div>
                <div className="sb-user-role">{isSuperAdmin?'Super Admin':'School Admin'}</div>
              </div>
            </div>
            <button className="sb-item" onClick={doLogout} style={{color:'#fca5a5'}}><span className="icon">🚪</span>Logout</button>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────── */}
        <main className="main-content">

          {/* Overview */}
          <div className={`page${activePage==='overview'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Overview <span>Dashboard</span></h1><p>{lastUpdated}</p></div>
              <div className="topbar-right">
                <div className="badge-live"><div className="dot"/>Live Data</div>
                <button className="btn btn-outline" onClick={loadRegistrations}>🔄 Refresh</button>
                <button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button>
              </div>
            </div>
            <div className="revenue-hero">
              <div>
                <div className="rev-label">💰 Total Revenue Collected</div>
                <div className="rev-val">₹{fmtR(totalRev)}</div>
                <div className="rev-sub">From {paid.length} confirmed payments</div>
              </div>
              <div className="rev-stats">
                <div className="rev-stat"><div className="rev-stat-val">{conv}%</div><div className="rev-stat-lbl">Conversion</div></div>
                <div className="rev-stat"><div className="rev-stat-val">₹{fmtR(avg)}</div><div className="rev-stat-lbl">Avg ticket</div></div>
                <div className="rev-stat"><div className="rev-stat-val">{allRows.filter(r=>r.created_at?.slice(0,10)===today).length}</div><div className="rev-stat-lbl">Today</div></div>
              </div>
            </div>
            <div className="stats-grid">
              {[
                {color:'blue',  icon:'📋',label:'Total',    val:allRows.length,  sub:'All registrations'},
                {color:'green', icon:'✅',label:'Paid',     val:paid.length,     sub:'Confirmed'},
                {color:'orange',icon:'⏳',label:'Pending',  val:pending.length,  sub:'Awaiting payment'},
                {color:'red',   icon:'❌',label:'Failed',   val:failed.length,   sub:'Cancelled/failed'},
                {color:'purple',icon:'🏷️',label:'Discounts',val:allRows.filter(r=>r.discount_code).length,sub:'Used codes'},
                {color:'blue',  icon:'📅',label:'This Week',val:thisWeek,        sub:'Last 7 days'},
              ].map(c=>(
                <div key={c.label} className={`stat-card ${c.color}`}>
                  <div className="stat-icon">{c.icon}</div>
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-val">{c.val}</div>
                  <div className="stat-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
              <span style={{fontSize:13,color:'var(--m)',fontWeight:600}}>Show:</span>
              <div className="period-tabs">{[7,14,30].map(d=><button key={d} className={`period-tab${trendDays===d?' active':''}`} onClick={()=>setTrendDays(d)}>{d}d</button>)}</div>
            </div>
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📅 Daily Registrations</div></div></div><div className="chart-wrap"><canvas id="chartDaily"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">📊 Payment Status</div></div></div><div className="chart-wrap"><canvas id="chartStatus"/></div></div>
            </div>
          </div>

          {/* Students */}
          <div className={`page${activePage==='students'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Students <span>Table</span></h1><p>{allRows.length} total records</p></div><div className="topbar-right"><button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button></div></div>
            <StudentsTable rows={allRows} onRowClick={setModal} />
          </div>

          {/* Trends */}
          <div className={`page${activePage==='trends'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Trends <span>Analysis</span></h1></div></div>
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📈 30-Day Trend</div></div></div><div className="chart-wrap tall"><canvas id="chartTrend"/></div></div>
            </div>
          </div>

          {/* Follow-Up */}
          <div className={`page${activePage==='followup'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Follow-Up <span>Tracker</span></h1><p>{followUpCount} need follow-up</p></div></div>
            <FollowUpList rows={allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status))} onRowClick={setModal} />
          </div>

          {/* Heatmap */}
          <div className={`page${activePage==='heatmap'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>City <span>Heatmap</span></h1></div></div>
            <CityHeatmap rows={allRows} />
          </div>

          {/* Recent */}
          <div className={`page${activePage==='recent'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Recent <span>Activity</span></h1></div></div>
            <Timeline rows={allRows.slice(0,50)} onRowClick={setModal} />
          </div>

          {/* ── PROGRAMS ────────────────────────────────────────────── */}
          <div className={`page${activePage==='programs'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Programs <span>Management</span></h1><p>Define base programs with URLs and pricing</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setProgramForm({})}>+ Add Program</button>}</div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Program Name</th><th>Slug</th><th>Base URL</th><th>Base Price INR (₹)</th><th>Base Price USD ($)</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {programs.length===0
                  ? <tr><td colSpan={7} className="table-empty">No programs yet. Create a program first, then assign schools to it.</td></tr>
                  : programs.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:700}}>{p.name}</td>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12}}>{p.slug}</code></td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{`www.thynksuccess.com/registration/${p.slug}/[schoolcode]`}</td>
                      <td><span className="amt">₹{fmtR(p.base_amount_inr ?? (p.currency==='INR'?p.base_amount:0) ?? 0)}</span></td>
                      <td><span className="amt" style={{color:'#22c55e'}}>${fmtR(p.base_amount_usd ?? (p.currency==='USD'?p.base_amount:0) ?? 0)}</span></td>
                      <td><span className={`badge ${p.status==='active'?'badge-paid':'badge-cancelled'}`}>{p.status}</span></td>
                      <td><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setProgramForm(p)}>Edit</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── SCHOOLS ─────────────────────────────────────────────── */}          <div className={`page${activePage==='schools'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Schools <span>Management</span></h1><p>{schools.length} schools configured</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>{loadPrograms();setSchoolForm({});}}>+ Add School</button>}</div>
            </div>
            <SchoolsTable schools={schools} programs={programs} isSuperAdmin={isSuperAdmin} onEdit={s=>{loadPrograms();setSchoolForm(s);}} />
          </div>

          {/* ── DISCOUNT CODES ───────────────────────────────────────── */}
          <div className={`page${activePage==='discounts'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Discount <span>Codes</span></h1><p>{discounts.filter(d=>d.is_active).length} active codes</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setDiscountForm({})}>+ New Code</button></div>
            </div>
            <p style={{fontSize:12,color:'var(--m)',marginBottom:16,padding:'0 4px'}}>💡 By default each school's code is its discount code. You can create additional codes below.</p>
            <div className="tbl-wrap"><table>
              <thead><tr><th>School</th><th>Code</th><th>Discount (₹)</th><th>Used / Max</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {discounts.length===0
                  ? <tr><td colSpan={7} className="table-empty">No discount codes yet.</td></tr>
                  : discounts.map(d=>(
                    <tr key={d.id}>
                      <td style={{fontSize:12}}>{d.schools?.name??d.school_id}</td>
                      <td><code style={{background:'var(--orange2)',color:'var(--orange)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{d.code}</code></td>
                      <td><span style={{color:'var(--green)',fontWeight:700}}>₹{fmtR(d.discount_amount)}</span></td>
                      <td style={{fontSize:12}}>{d.used_count} / {d.max_uses??'∞'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{d.expires_at?new Date(d.expires_at).toLocaleDateString('en-IN'):'Never'}</td>
                      <td><span className={`badge ${d.is_active?'badge-paid':'badge-cancelled'}`}>{d.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setDiscountForm(d)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Delete code ${d.code}?`))return;await fetch(`${BACKEND}/api/admin/discounts`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id})});loadDiscounts();}}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── ADMIN USERS ──────────────────────────────────────────── */}
          <div className={`page${activePage==='users'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Admin <span>Users</span></h1></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setUserForm({})}>+ Add Admin</button>}</div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Email</th><th>Role</th><th>School Access</th><th>Added</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
              <tbody>
                {adminUsers.length===0
                  ? <tr><td colSpan={5} className="table-empty">No admin users yet.</td></tr>
                  : adminUsers.map(u=>(
                    <tr key={u.id}>
                      <td style={{fontWeight:700}}>{u.email}</td>
                      <td><span className={`badge ${u.role==='super_admin'?'badge-paid':'badge-initiated'}`}>{u.role==='super_admin'?'Super Admin':'School Admin'}</span></td>
                      <td style={{fontSize:12}}>{u.role==='super_admin'?'All Schools':u.schools?.name??'—'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                      {isSuperAdmin&&<td><button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Remove ${u.email}?`))return;await fetch(`${BACKEND}/api/admin/users`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({role_id:u.id})});loadUsers();}}>Remove</button></td>}
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── INTEGRATIONS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='integrations'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Integrations <span>Setup</span></h1><p>Payment gateways, email & WhatsApp providers</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setIntegrationForm({})}>+ Add Integration</button></div>
            </div>

            {/* Payment Gateways */}
            <SectionTitle>💳 Payment Gateways</SectionTitle>
            <div className="int-grid">
              {['razorpay','cashfree','easebuzz','paypal'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (
                  <IntCard key={provider} provider={provider} cfg={cfg}
                    onEdit={()=>setIntegrationForm(cfg??{provider})}
                    onToggle={async()=>{
                      if(!cfg) return;
                      await fetch(`${BACKEND}/api/admin/integrations`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})});
                      loadIntegrations();
                    }}
                  />
                );
              })}
            </div>

            {/* Email Providers */}
            <SectionTitle>✉️ Email Providers</SectionTitle>
            <div className="int-grid">
              {['smtp','sendgrid','aws_ses'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (
                  <IntCard key={provider} provider={provider} cfg={cfg}
                    onEdit={()=>setIntegrationForm(cfg??{provider})}
                    onToggle={async()=>{
                      if(!cfg) return;
                      await fetch(`${BACKEND}/api/admin/integrations`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})});
                      loadIntegrations();
                    }}
                  />
                );
              })}
            </div>

            {/* WhatsApp Providers */}
            <SectionTitle>💬 WhatsApp Providers</SectionTitle>
            <div className="int-grid">
              {['whatsapp_cloud','twilio'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (
                  <IntCard key={provider} provider={provider} cfg={cfg}
                    onEdit={()=>setIntegrationForm(cfg??{provider})}
                    onToggle={async()=>{
                      if(!cfg) return;
                      await fetch(`${BACKEND}/api/admin/integrations`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})});
                      loadIntegrations();
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* ── TRIGGERS ─────────────────────────────────────────────── */}
          <div className={`page${activePage==='triggers'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Triggers <span>Automation</span></h1><p>Auto-send messages when events happen</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setTriggerForm({})}>+ Add Trigger</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Event</th><th>Channel</th><th>Template</th><th>School</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {triggers.length===0
                  ? <tr><td colSpan={6} className="table-empty">No triggers yet. Add a trigger to auto-send messages on registration or payment events.</td></tr>
                  : triggers.map(t=>(
                    <tr key={t.id}>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12}}>{t.event_type}</code></td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{fontSize:12}}>{t.notification_templates?.name??'—'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{t.school_id??'All Schools'}</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTriggerForm(t)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete trigger?'))return;await fetch(`${BACKEND}/api/admin/triggers`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id})});loadTriggers();}}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── TEMPLATES ────────────────────────────────────────────── */}
          <div className={`page${activePage==='templates'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Message <span>Templates</span></h1><p>Email & WhatsApp message drafts</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setTemplateForm({})}>+ New Template</button></div>
            </div>
            <p style={{fontSize:12,color:'var(--m)',marginBottom:16,padding:'0 4px'}}>
              💡 Use <code style={{background:'var(--acc3)',color:'var(--acc)',padding:'1px 6px',borderRadius:4}}>{'{{student_name}}'}</code> <code style={{background:'var(--acc3)',color:'var(--acc)',padding:'1px 6px',borderRadius:4}}>{'{{school_name}}'}</code> <code style={{background:'var(--acc3)',color:'var(--acc)',padding:'1px 6px',borderRadius:4}}>{'{{amount}}'}</code> <code style={{background:'var(--acc3)',color:'var(--acc)',padding:'1px 6px',borderRadius:4}}>{'{{txn_id}}'}</code> as placeholders.
            </p>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Name</th><th>Channel</th><th>Subject</th><th>Preview</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {templates.length===0
                  ? <tr><td colSpan={6} className="table-empty">No templates yet. Create email or WhatsApp message templates here.</td></tr>
                  : templates.map(t=>(
                    <tr key={t.id}>
                      <td style={{fontWeight:700}}>{t.name}</td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{fontSize:12}}>{t.subject??'—'}</td>
                      <td style={{fontSize:11,color:'var(--m)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.body?.slice(0,80)}…</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTemplateForm(t)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete template?'))return;await fetch(`${BACKEND}/api/admin/templates`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id})});loadTemplates();}}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── LOCATION MASTER ──────────────────────────────────────── */}
          <div className={`page${activePage==='locations'?' active':''}`}>
            <LocationMasterPage
              rows={locations}
              BACKEND={BACKEND}
              onReload={loadLocations}
              showToast={showToast}
            />
          </div>

        </main>
      </div>

      {/* Student detail modal */}
      {modal&&(
        <div className="modal-overlay show" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
          <div className="modal">
            <div className="modal-head"><h3>{modal.student_name}</h3><button className="modal-close" onClick={()=>setModal(null)}>✕</button></div>
            <div className="modal-body">
              {[['Status',<span key="s" className={`badge badge-${modal.payment_status??'pending'}`}>{modal.payment_status??'—'}</span>],['Date',modal.created_at?.slice(0,10)??'—'],['Student',modal.student_name],['Class',modal.class_grade],['Gender',modal.gender],['School',modal.parent_school],['City',modal.city],['Parent',modal.parent_name],['Phone',<a key="p" href={`tel:${modal.contact_phone}`} style={{color:'var(--acc)',fontWeight:600}}>{modal.contact_phone}</a>],['Email',<a key="e" href={`mailto:${modal.contact_email}`} style={{color:'var(--acc)',fontSize:12}}>{modal.contact_email}</a>],['Gateway',modal.gateway??'—'],['Base',`₹${fmtR(modal.base_amount??0)}`],['Discount',modal.discount_code?`🏷️ ${modal.discount_code} (₹${fmtR(modal.discount_amount??0)} off)`:'None'],['Paid',<span key="a" style={{fontFamily:'Sora',fontWeight:800,color:'var(--green)',fontSize:18}}>₹{fmtR(modal.final_amount??0)}</span>],['Txn ID',<span key="t" style={{fontSize:11,color:'var(--m2)',wordBreak:'break-all'}}>{modal.gateway_txn_id??'—'}</span>]].map(([l,v])=><div key={String(l)} className="modal-row"><div className="modal-lbl">{l}</div><div className="modal-val">{v}</div></div>)}
            </div>
            <div className="modal-actions">
              <a className="fu-btn wa"   href={`https://wa.me/91${modal.contact_phone}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
              <a className="fu-btn call" href={`tel:${modal.contact_phone}`}>📞 Call</a>
              <a className="fu-btn" style={{background:'var(--orange2)',color:'var(--orange)'}} href={`mailto:${modal.contact_email}`}>✉️ Email</a>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down modal */}
      {drillData&&(
        <div className="drill-overlay show" onClick={e=>{if(e.target===e.currentTarget)setDrillData(null);}}>
          <div className="drill-modal">
            <div className="drill-head"><div><h3>{drillData.title}</h3><span className="drill-count">({drillData.rows.length})</span></div><button className="drill-close" onClick={()=>setDrillData(null)}>✕</button></div>
            <div className="drill-body">
              {drillData.rows.map((r,i)=>(
                <div key={r.id} className="drill-row" onClick={()=>{setDrillData(null);setTimeout(()=>setModal(r),200);}}>
                  <div className="drill-num">{i+1}</div>
                  <div style={{flex:1}}><div className="drill-name">{r.student_name} <span className={`badge badge-${r.payment_status}`} style={{fontSize:10}}>{r.payment_status}</span></div><div className="drill-meta">{r.class_grade} · {r.parent_school} · {r.city}</div></div>
                  <div style={{textAlign:'right'}}><div className="drill-amt">₹{fmtR(r.final_amount??0)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Program form */}
      {programForm!==null&&<ProgramFormModal initial={programForm} onClose={()=>setProgramForm(null)} onSave={async(data)=>{await saveForm('/api/admin/projects',data,()=>{setProgramForm(null);loadPrograms();},data.id?'Program updated!':'Program created!');}} />}

      {/* School form */}
      {schoolForm!==null&&<SchoolFormModal initial={schoolForm} programs={programs} onClose={()=>setSchoolForm(null)} onSave={async(data)=>{await saveForm('/api/admin/schools',data,()=>{setSchoolForm(null);loadSchools();},data.id?'School updated!':'School created!');}} />}

      {/* Discount form */}
      {discountForm!==null&&<DiscountFormModal initial={discountForm} schools={schools} onClose={()=>setDiscountForm(null)} onSave={async(data)=>{await saveForm('/api/admin/discounts',data,()=>{setDiscountForm(null);loadDiscounts();},data.id?'Code updated!':'Code created!');}} />}

      {/* User form */}
      {userForm!==null&&<UserFormModal schools={schools} onClose={()=>setUserForm(null)} onSave={async(data)=>{await saveForm('/api/admin/users',data,()=>{setUserForm(null);loadUsers();},'Admin user created!');}} />}

      {/* Integration form */}
      {integrationForm!==null&&<IntegrationFormModal initial={integrationForm} schools={schools} onClose={()=>setIntegrationForm(null)} onSave={async(data)=>{await saveForm('/api/admin/integrations',data,()=>{setIntegrationForm(null);loadIntegrations();},data.id?'Integration updated!':'Integration saved!');}} />}

      {/* Trigger form */}
      {triggerForm!==null&&<TriggerFormModal initial={triggerForm} schools={schools} templates={templates} onClose={()=>setTriggerForm(null)} onSave={async(data)=>{await saveForm('/api/admin/triggers',data,()=>{setTriggerForm(null);loadTriggers();},data.id?'Trigger updated!':'Trigger created!');}} />}

      {/* Template form */}
      {templateForm!==null&&<TemplateFormModal initial={templateForm} onClose={()=>setTemplateForm(null)} onSave={async(data)=>{await saveForm('/api/admin/templates',data,()=>{setTemplateForm(null);loadTemplates();},data.id?'Template updated!':'Template created!');}} />}
    </>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────────
function SectionTitle({ children }:{ children:React.ReactNode }) {
  return <h3 style={{fontSize:14,fontWeight:700,color:'var(--m)',margin:'24px 0 12px',textTransform:'uppercase',letterSpacing:'.06em'}}>{children}</h3>;
}

function IntCard({ provider, cfg, onEdit, onToggle }:{ provider:string; cfg:Row|undefined; onEdit:()=>void; onToggle:()=>void }) {
  const labels:Record<string,string> = { razorpay:'Razorpay', cashfree:'Cashfree', easebuzz:'Easebuzz', paypal:'PayPal', smtp:'SMTP Email', sendgrid:'SendGrid', aws_ses:'AWS SES', whatsapp_cloud:'WhatsApp Cloud API', twilio:'Twilio WhatsApp' };
  const icons:Record<string,string>  = { razorpay:'💳', cashfree:'💳', easebuzz:'💳', paypal:'🅿️', smtp:'📧', sendgrid:'📨', aws_ses:'☁️', whatsapp_cloud:'💬', twilio:'💬' };
  const active = cfg?.is_active ?? false;
  return (
    <div style={{background:'var(--card)',border:`2px solid ${active?'var(--green)':'var(--bd)'}`,borderRadius:14,padding:'16px 18px',display:'flex',alignItems:'center',gap:12}}>
      <div style={{fontSize:24}}>{icons[provider]??'⚙️'}</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:14}}>{labels[provider]??provider}</div>
        <div style={{fontSize:11,color:active?'var(--green)':'var(--m2)',marginTop:2}}>{cfg ? (active?'✅ Active & configured':'⚠️ Configured but inactive') : '⬜ Not configured'}</div>
      </div>
      <div style={{display:'flex',gap:6}}>
        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={onEdit}>{cfg?'Edit':'Setup'}</button>
        {cfg&&<button className="btn" style={{fontSize:11,padding:'4px 10px',background:active?'var(--red2)':'var(--green2)',color:active?'var(--red)':'var(--green)',border:'none'}} onClick={onToggle}>{active?'Disable':'Enable'}</button>}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }:{ title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay show" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{maxWidth:580}}>
        <div className="modal-head"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{padding:'20px 24px'}}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--m)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</label>{children}</div>;
}

const IS:React.CSSProperties = { width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' };
const SS:React.CSSProperties = { ...IS, appearance:'none' as any };

// ── Program Form ────────────────────────────────────────────────────
function ProgramFormModal({ initial, onClose, onSave }:{ initial:Row; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({
    id:           initial.id??'',
    name:         initial.name??'',
    slug:         initial.slug??'',
    base_amount_inr: initial.base_amount_inr ? String(initial.base_amount_inr/100) : (initial.base_amount && initial.currency==='INR' ? String(initial.base_amount/100) : ''),
    base_amount_usd: initial.base_amount_usd ? String(initial.base_amount_usd/100) : (initial.base_amount && initial.currency==='USD' ? String(initial.base_amount/100) : ''),
    status:       initial.status??'active',
  });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p=>({...p,[k]:e.target.value}));
  const autoSlug = (name:string) => name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  return (
    <ModalShell title={f.id?'Edit Program':'New Program'} onClose={onClose}>
      <Field label="Program Name *"><input style={IS} value={f.name} onChange={e=>{setF(p=>({...p,name:e.target.value,slug:p.slug||autoSlug(e.target.value)}));}} placeholder="e.g. Thynk Success 2025"/></Field>
      <Field label="Slug * (used in URL)"><input style={IS} value={f.slug} onChange={set('slug')} placeholder="thynk-success-2025" disabled={!!f.id}/></Field>
      <p style={{fontSize:11,color:'var(--m)',marginTop:-10,marginBottom:12}}>Registration URL will be: <code>www.thynksuccess.com/registration/{f.slug||'[slug]'}/[schoolcode]</code></p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Base Price — INR (₹) *">
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontWeight:700,color:'var(--m)',fontSize:14,pointerEvents:'none'}}>₹</span>
            <input style={{...IS,paddingLeft:26}} type="number" value={f.base_amount_inr} onChange={set('base_amount_inr')} placeholder="e.g. 1200"/>
          </div>
          <p style={{fontSize:10,color:'var(--m)',marginTop:3}}>Used when school country = India</p>
        </Field>
        <Field label="Base Price — USD ($) *">
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontWeight:700,color:'var(--m)',fontSize:14,pointerEvents:'none'}}>$</span>
            <input style={{...IS,paddingLeft:26}} type="number" value={f.base_amount_usd} onChange={set('base_amount_usd')} placeholder="e.g. 50"/>
          </div>
          <p style={{fontSize:10,color:'var(--m)',marginTop:3}}>Used for all other countries</p>
        </Field>
        <Field label="Status"><select style={SS} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>
      <div style={{background:'var(--acc3)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12}}>
        <span style={{color:'var(--acc)',fontWeight:600}}>💡 Currency is auto-selected per school:</span>
        <span style={{color:'var(--m)',marginLeft:6}}>Indian schools → INR price · International schools → USD price</span>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({
          ...f,
          base_amount_inr: Math.round(Number(f.base_amount_inr||0)*100),
          base_amount_usd: Math.round(Number(f.base_amount_usd||0)*100),
          // keep legacy base_amount as INR for backwards compat
          base_amount: Math.round(Number(f.base_amount_inr||0)*100),
          currency: 'INR',
        })}>{f.id?'Save Changes':'Create Program'}</button>
      </div>
    </ModalShell>
  );
}

// ── Location master data ────────────────────────────────────────────
const LOCATION_DATA: Record<string, { states: Record<string, string[]> }> = {
  India: {
    states: {
      'Andhra Pradesh': ['Visakhapatnam','Vijayawada','Guntur','Nellore','Tirupati'],
      'Arunachal Pradesh': ['Itanagar','Naharlagun','Pasighat'],
      'Assam': ['Guwahati','Silchar','Dibrugarh','Jorhat'],
      'Bihar': ['Patna','Gaya','Bhagalpur','Muzaffarpur','Darbhanga'],
      'Chhattisgarh': ['Raipur','Bhilai','Bilaspur','Durg'],
      'Delhi': ['New Delhi','Delhi'],
      'Goa': ['Panaji','Margao','Vasco da Gama'],
      'Gujarat': ['Ahmedabad','Surat','Vadodara','Rajkot','Gandhinagar','Bhavnagar'],
      'Haryana': ['Gurugram','Faridabad','Chandigarh','Ambala','Hisar','Karnal'],
      'Himachal Pradesh': ['Shimla','Dharamsala','Manali','Solan'],
      'Jharkhand': ['Ranchi','Jamshedpur','Dhanbad','Bokaro'],
      'Karnataka': ['Bengaluru','Mysuru','Hubli','Mangaluru','Belagavi'],
      'Kerala': ['Thiruvananthapuram','Kochi','Kozhikode','Thrissur','Kollam'],
      'Madhya Pradesh': ['Bhopal','Indore','Gwalior','Jabalpur','Ujjain'],
      'Maharashtra': ['Mumbai','Pune','Nagpur','Nashik','Aurangabad','Thane','Navi Mumbai'],
      'Manipur': ['Imphal'],
      'Meghalaya': ['Shillong'],
      'Mizoram': ['Aizawl'],
      'Nagaland': ['Kohima','Dimapur'],
      'Odisha': ['Bhubaneswar','Cuttack','Rourkela','Berhampur'],
      'Punjab': ['Ludhiana','Amritsar','Jalandhar','Patiala','Chandigarh'],
      'Rajasthan': ['Jaipur','Jodhpur','Udaipur','Kota','Ajmer','Bikaner'],
      'Sikkim': ['Gangtok'],
      'Tamil Nadu': ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli'],
      'Telangana': ['Hyderabad','Warangal','Nizamabad','Karimnagar'],
      'Tripura': ['Agartala'],
      'Uttar Pradesh': ['Lucknow','Kanpur','Agra','Varanasi','Prayagraj','Ghaziabad','Noida','Meerut','Bareilly'],
      'Uttarakhand': ['Dehradun','Haridwar','Roorkee','Rishikesh','Nainital'],
      'West Bengal': ['Kolkata','Howrah','Durgapur','Asansol','Siliguri'],
      'Jammu & Kashmir': ['Srinagar','Jammu'],
      'Ladakh': ['Leh','Kargil'],
      'Chandigarh': ['Chandigarh'],
      'Puducherry': ['Puducherry'],
      'Andaman & Nicobar': ['Port Blair'],
      'Lakshadweep': ['Kavaratti'],
      'Dadra & Nagar Haveli': ['Silvassa'],
      'Daman & Diu': ['Daman','Diu'],
    },
  },
  // Gulf Region
  'United Arab Emirates': { states: { 'Abu Dhabi': ['Abu Dhabi','Al Ain'], 'Dubai': ['Dubai'], 'Sharjah': ['Sharjah'], 'Ajman': ['Ajman'], 'Fujairah': ['Fujairah'], 'Ras Al Khaimah': ['Ras Al Khaimah'], 'Umm Al Quwain': ['Umm Al Quwain'] } },
  'Saudi Arabia': { states: { 'Riyadh': ['Riyadh'], 'Makkah': ['Jeddah','Mecca','Taif'], 'Madinah': ['Medina'], 'Eastern Province': ['Dammam','Khobar','Dhahran','Jubail'], 'Asir': ['Abha'], 'Kuwait': [] } },
  'Kuwait': { states: { 'Kuwait Governorate': ['Kuwait City'], 'Ahmadi': ['Ahmadi'], 'Hawalli': ['Hawalli'], 'Farwaniya': ['Farwaniya'] } },
  'Qatar': { states: { 'Doha': ['Doha'], 'Al Rayyan': ['Al Rayyan'], 'Al Wakrah': ['Al Wakrah'], 'Al Khor': ['Al Khor'] } },
  'Bahrain': { states: { 'Capital': ['Manama'], 'Muharraq': ['Muharraq'], 'Northern': ['Hamad Town'], 'Southern': ['Riffa'] } },
  'Oman': { states: { 'Muscat': ['Muscat','Seeb'], 'Dhofar': ['Salalah'], 'Batinah': ['Sohar'], 'Sharqiyah': ['Sur'] } },
  // South East Asia
  'Singapore': { states: { 'Central Region': ['Singapore'] } },
  'Malaysia': { states: { 'Kuala Lumpur': ['Kuala Lumpur'], 'Selangor': ['Shah Alam','Petaling Jaya','Klang'], 'Penang': ['George Town'], 'Johor': ['Johor Bahru'], 'Sabah': ['Kota Kinabalu'], 'Sarawak': ['Kuching'] } },
  'Indonesia': { states: { 'DKI Jakarta': ['Jakarta'], 'West Java': ['Bandung','Bekasi','Depok'], 'East Java': ['Surabaya','Malang'], 'Bali': ['Denpasar'] } },
  'Thailand': { states: { 'Bangkok': ['Bangkok'], 'Chiang Mai': ['Chiang Mai'], 'Phuket': ['Phuket Town'] } },
  'Philippines': { states: { 'Metro Manila': ['Manila','Quezon City','Makati','Pasig'], 'Cebu': ['Cebu City'], 'Davao': ['Davao City'] } },
  'Vietnam': { states: { 'Hanoi': ['Hanoi'], 'Ho Chi Minh City': ['Ho Chi Minh City'], 'Da Nang': ['Da Nang'] } },
  'Myanmar': { states: { 'Yangon Region': ['Yangon'], 'Mandalay Region': ['Mandalay'], 'Naypyidaw': ['Naypyidaw'] } },
  'Cambodia': { states: { 'Phnom Penh': ['Phnom Penh'], 'Siem Reap': ['Siem Reap'] } },
  'Sri Lanka': { states: { 'Western Province': ['Colombo','Sri Jayawardenepura Kotte'], 'Central Province': ['Kandy'], 'Southern Province': ['Galle'] } },
  'Nepal': { states: { 'Bagmati': ['Kathmandu','Lalitpur','Bhaktapur'], 'Gandaki': ['Pokhara'] } },
  'Bangladesh': { states: { 'Dhaka Division': ['Dhaka','Narayanganj'], 'Chittagong Division': ['Chittagong'], 'Rajshahi Division': ['Rajshahi'] } },
  'Pakistan': { states: { 'Punjab': ['Lahore','Faisalabad','Rawalpindi'], 'Sindh': ['Karachi','Hyderabad'], 'KPK': ['Peshawar'], 'Islamabad Capital Territory': ['Islamabad'] } },
  'Other': { states: { 'Other': [] } },
};
const INDIA_CURRENCY = 'INR';
const isIndianCountry = (c: string) => c === 'India';

// ── School Form ─────────────────────────────────────────────────────
const EMPTY_CONTACT = { name:'', designation:'', email:'', mobile:'' };

function SchoolFormModal({ initial, programs, onClose, onSave }:{ initial:Row; programs:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const initContacts = (() => {
    if (Array.isArray(initial.contact_persons) && initial.contact_persons.length) return initial.contact_persons;
    return [{ ...EMPTY_CONTACT }];
  })();

  const [f,setF] = useState({
    id:            initial.id??'',
    school_code:   initial.school_code??'',
    name:          initial.name??'',
    org_name:      initial.org_name??'',
    // Address fields
    address:       initial.address??'',
    pin_code:      initial.pin_code??'',
    country:       initial.country||'India',
    state:         initial.state??'',
    city:          initial.city??'',
    project_id:    initial.project_id??'',
    school_price:  initial.pricing?.[0]?.base_amount ? String(initial.pricing[0].base_amount/100) : '',
    currency:      initial.pricing?.[0]?.currency ?? (isIndianCountry(initial.country||'India') ? 'INR' : 'USD'),
    discount_code: initial.discount_code ?? initial.school_code?.toUpperCase() ?? '',
    primary_color: initial.branding?.primaryColor??'#4f46e5',
    accent_color:  initial.branding?.accentColor??'#8b5cf6',
    is_active:     initial.is_active!==false,
  });
  const [contacts, setContacts] = useState<{name:string;designation:string;email:string;mobile:string}[]>(initContacts);

  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
    const val = e.target.type==='checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setF(p => {
      const updated = {...p, [k]: val};
      if (k === 'country') {
        updated.currency = isIndianCountry(val as string) ? 'INR' : 'USD';
        updated.state = '';
        updated.city = '';
      }
      if (k === 'state') updated.city = '';
      if (k === 'school_code' && !p.id) {
        updated.discount_code = (val as string).toUpperCase();
      }
      return updated;
    });
  };

  const setContact = (idx:number, field:string) => (e:React.ChangeEvent<HTMLInputElement>) => {
    setContacts(prev => prev.map((c,i) => i===idx ? {...c,[field]:e.target.value} : c));
  };
  const addContact = () => { if (contacts.length < 4) setContacts(p=>[...p,{...EMPTY_CONTACT}]); };
  const removeContact = (idx:number) => { if (contacts.length > 1) setContacts(p=>p.filter((_,i)=>i!==idx)); };

  const selProgram = programs.find(p=>p.id===f.project_id);
  const countryData = LOCATION_DATA[f.country] ?? LOCATION_DATA['Other'];
  const stateList = Object.keys(countryData.states);
  const cityList = f.state ? (countryData.states[f.state] ?? []) : [];

  // Auto-computed registration URL — always shown once program selected
  const regUrl = selProgram
    ? `https://www.thynksuccess.com/registration/${selProgram.slug}/${f.school_code||'[schoolcode]'}`
    : '';

  // Base price from program
  const basePriceDisplay = (() => {
    if (!selProgram) return null;
    if (isIndianCountry(f.country)) {
      const inr = selProgram.base_amount_inr ?? (selProgram.currency==='INR' ? selProgram.base_amount : null);
      return inr ? { label:`₹${fmtR(inr)}`, raw: String(inr/100) } : null;
    } else {
      const usd = selProgram.base_amount_usd ?? (selProgram.currency==='USD' ? selProgram.base_amount : null);
      return usd ? { label:`$${fmtR(usd)}`, raw: String(usd/100) } : null;
    }
  })();

  useEffect(() => {
    if (basePriceDisplay?.raw && !f.id) {
      setF(p => ({...p, school_price: basePriceDisplay.raw}));
    }
  }, [f.project_id, f.country]);

  return (
    <ModalShell title={f.id?'Edit School':'Add New School'} onClose={onClose}>
      {/* Basic Info */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School Code *"><input style={{...IS,fontFamily:'monospace'}} value={f.school_code} onChange={set('school_code')} placeholder="e.g. delhi-dps" disabled={!!f.id}/></Field>
        <Field label="School Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="Delhi Public School"/></Field>
        <Field label="Organisation Name *"><input style={IS} value={f.org_name} onChange={set('org_name')} placeholder="Thynk Success"/></Field>
      </div>

      {/* Address Section */}
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>🏠 Address</div>
        <Field label="Complete Address *">
          <textarea style={{...IS,height:64,resize:'vertical'}} value={f.address} onChange={set('address')} placeholder="Enter full street address…"/>
        </Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'0 12px'}}>
          <Field label="Pin Code *"><input style={IS} value={f.pin_code} onChange={set('pin_code')} placeholder="110001"/></Field>
          <Field label="Country *">
            <select style={SS} value={f.country} onChange={set('country')}>
              {Object.keys(LOCATION_DATA).map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="State / Region *">
            <select style={SS} value={f.state} onChange={set('state')} disabled={stateList.length===0}>
              <option value="">Select State</option>
              {stateList.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="City *">
            {cityList.length > 0 ? (
              <select style={SS} value={f.city} onChange={set('city')}>
                <option value="">Select City</option>
                {cityList.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input style={IS} value={f.city} onChange={set('city')} placeholder="Enter city"/>
            )}
          </Field>
        </div>
      </div>

      {/* Contact Persons */}
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase'}}>👤 Contact Persons</div>
          {contacts.length < 4 && (
            <button onClick={addContact} style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:600,cursor:'pointer'}}>+ Add Contact</button>
          )}
        </div>
        {contacts.map((c,idx)=>(
          <div key={idx} style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:8,padding:'10px 12px',marginBottom:idx<contacts.length-1?10:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--m)'}}>Contact {idx+1}</span>
              {contacts.length > 1 && <button onClick={()=>removeContact(idx)} style={{background:'none',border:'none',color:'var(--red,#ef4444)',cursor:'pointer',fontSize:13,lineHeight:1}}>✕</button>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
              <Field label="Contact Person Name *"><input style={IS} value={c.name} onChange={setContact(idx,'name')} placeholder="Full Name"/></Field>
              <Field label="Designation *"><input style={IS} value={c.designation} onChange={setContact(idx,'designation')} placeholder="Principal / Coordinator"/></Field>
              <Field label="Email ID *"><input style={IS} type="email" value={c.email} onChange={setContact(idx,'email')} placeholder="contact@school.edu"/></Field>
              <Field label="Mobile Number *"><input style={IS} type="tel" value={c.mobile} onChange={setContact(idx,'mobile')} placeholder="+91 98765 43210"/></Field>
            </div>
          </div>
        ))}
        <p style={{fontSize:10,color:'var(--m)',marginTop:8}}>You can add up to 4 contact persons. All fields are required for each contact.</p>
      </div>

      {/* Program & Registration URL */}
      <Field label="Program *">
        <select style={SS} value={f.project_id} onChange={set('project_id')}>
          <option value="">Select a program</option>
          {programs.filter(p=>p.status==='active').map(p=>{
            const inr = p.base_amount_inr ?? (p.currency==='INR'?p.base_amount:null);
            const usd = p.base_amount_usd ?? (p.currency==='USD'?p.base_amount:null);
            return <option key={p.id} value={p.id}>{p.name} — {inr?`₹${(inr/100).toLocaleString('en-IN')}`:'—'} / {usd?`$${(usd/100).toLocaleString()}`:'—'}</option>;
          })}
        </select>
      </Field>

      {/* Registration URL — always visible once program selected */}
      <Field label="Registration Link (auto-generated)">
        <input style={{...IS,fontFamily:'monospace',fontSize:11,color:'var(--acc)',background:'var(--acc3)'}}
          value={regUrl || '(select a program and enter school code)'}
          readOnly
          onClick={e=>(e.target as HTMLInputElement).select()}
        />
        {regUrl && <p style={{fontSize:10,color:'var(--m)',marginTop:3}}>Click to select · Base URL + School Code auto-combined</p>}
      </Field>

      {/* Pricing Section */}
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>💰 Pricing</div>
        {/* Base Price Display */}
        {basePriceDisplay && (
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,background:'var(--acc3)',borderRadius:8,padding:'8px 12px'}}>
            <span style={{fontSize:12,color:'var(--m)',fontWeight:600}}>Program Base Price:</span>
            <span style={{fontSize:15,fontWeight:800,fontFamily:'Sora',color:'var(--acc)'}}>{basePriceDisplay.label}</span>
            <span style={{fontSize:11,color:'var(--m)'}}>(auto-filled below)</span>
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label={`School Pricing (${f.currency}) *`}>
            <input style={IS} type="number" value={f.school_price} onChange={set('school_price')}
              placeholder={basePriceDisplay ? `Base: ${basePriceDisplay.label}` : 'Enter amount'}/>
          </Field>
          <Field label="Currency">
            <select style={SS} value={f.currency} onChange={set('currency')}>
              <option value="INR">INR (₹) — India</option>
              <option value="USD">USD ($) — International</option>
            </select>
            <p style={{fontSize:10,color:'var(--m)',marginTop:3}}>Auto-set from country selection</p>
          </Field>
        </div>
      </div>

      {/* Discount Code Section */}
      <div style={{background:'var(--orange2,rgba(245,158,11,0.08))',border:'1px solid rgba(245,158,11,0.2)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--orange,#f59e0b)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>🏷️ Discount Code</div>
        <Field label="Discount Code (default = school code)">
          <input style={{...IS,textTransform:'uppercase',fontFamily:'monospace',fontWeight:700}} value={f.discount_code}
            onChange={e=>setF(p=>({...p,discount_code:e.target.value.toUpperCase()}))} placeholder="e.g. DELHI-DPS"/>
        </Field>
        <p style={{fontSize:11,color:'var(--m)',marginTop:-8}}>
          When a student uses the Registration URL and enters this code, the school-specific discount fee will be applied.
        </p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Primary Colour"><input style={{...IS,height:40}} type="color" value={f.primary_color} onChange={set('primary_color')}/></Field>
        <Field label="Accent Colour"><input style={{...IS,height:40}} type="color" value={f.accent_color} onChange={set('accent_color')}/></Field>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <input type="checkbox" id="is_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/>
        <label htmlFor="is_active" style={{fontSize:13,fontWeight:600}}>School is Active</label>
      </div>

      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({...f, school_price:Math.round(Number(f.school_price)*100), contact_persons:contacts, address:f.address, pin_code:f.pin_code})}>{f.id?'Save Changes':'Create School'}</button>
      </div>
    </ModalShell>
  );
}

// ── Schools Table (with filters) ────────────────────────────────────
function SchoolsTable({ schools, programs, isSuperAdmin, onEdit }:{ schools:Row[]; programs:Row[]; isSuperAdmin:boolean; onEdit:(s:Row)=>void }) {
  const [filterProgram, setFilterProgram] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState,   setFilterState]   = useState('');
  const [filterCity,    setFilterCity]    = useState('');

  const countries = [...new Set(schools.map(s=>s.country).filter(Boolean))].sort();
  const states    = [...new Set(schools.filter(s=>!filterCountry||s.country===filterCountry).map(s=>s.state).filter(Boolean))].sort();
  const cities    = [...new Set(schools.filter(s=>(!filterCountry||s.country===filterCountry)&&(!filterState||s.state===filterState)).map(s=>s.city).filter(Boolean))].sort();

  const filtered = schools.filter(s => {
    const prog = programs.find(p=>p.id===s.project_id) ?? programs.find(p=>p.slug===s.project_slug);
    if (filterProgram && prog?.id !== filterProgram) return false;
    if (filterCountry && s.country !== filterCountry) return false;
    if (filterState   && s.state   !== filterState)   return false;
    if (filterCity    && s.city    !== filterCity)     return false;
    return true;
  });

  return (
    <>
      <div className="table-toolbar" style={{flexWrap:'wrap',gap:8,marginBottom:12}}>
        <select style={{...SS,width:'auto',minWidth:140}} value={filterProgram} onChange={e=>{setFilterProgram(e.target.value);}}>
          <option value="">All Programs</option>
          {programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={{...SS,width:'auto',minWidth:130}} value={filterCountry} onChange={e=>{setFilterCountry(e.target.value);setFilterState('');setFilterCity('');}}>
          <option value="">All Countries</option>
          {countries.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{...SS,width:'auto',minWidth:130}} value={filterState} onChange={e=>{setFilterState(e.target.value);setFilterCity('');}}>
          <option value="">All States</option>
          {states.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{...SS,width:'auto',minWidth:120}} value={filterCity} onChange={e=>setFilterCity(e.target.value)}>
          <option value="">All Cities</option>
          {cities.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{fontSize:12,color:'var(--m)',marginLeft:'auto'}}>{filtered.length} of {schools.length}</span>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Code</th><th>School Name</th><th>Organisation</th><th>City / State</th><th>Program</th><th>Base Price</th><th>School Price</th><th>Discount Code</th><th>Registration URL</th><th>Status</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
        <tbody>
          {filtered.length===0
            ? <tr><td colSpan={11} className="table-empty">No schools match the selected filters.</td></tr>
            : filtered.map(s=>{
              const prog = programs.find(p=>p.id===s.project_id) ?? programs.find(p=>p.slug===s.project_slug);
              const regUrl = `https://www.thynksuccess.com/registration/${s.project_slug??''}/${s.school_code}`;
              // Base price: pick INR or USD based on country
              const basePriceFmt = (() => {
                if (!prog) return '—';
                const isIndia = (s.country||'India').toLowerCase()==='india';
                if (isIndia) {
                  const inr = prog.base_amount_inr ?? (prog.currency==='INR' ? prog.base_amount : null);
                  return inr ? `₹${fmtR(inr)}` : '—';
                }
                const usd = prog.base_amount_usd ?? (prog.currency==='USD' ? prog.base_amount : null);
                return usd ? `$${fmtR(usd)}` : '—';
              })();
              const schoolCurrency = s.pricing?.[0]?.currency ?? 'INR';
              const schoolPriceFmt = schoolCurrency === 'USD'
                ? `$${fmtR(s.pricing?.[0]?.base_amount??0)}`
                : `₹${fmtR(s.pricing?.[0]?.base_amount??0)}`;
              return (
                <tr key={s.id}>
                  <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{s.school_code}</code></td>
                  <td style={{fontWeight:700}}>{s.name}</td>
                  <td style={{fontSize:12,color:'var(--m)'}}>{s.org_name}</td>
                  <td style={{fontSize:12}}>{[s.city,s.state,s.country].filter(Boolean).join(', ')||'—'}</td>
                  <td style={{fontSize:12}}>{prog?.name ?? s.project_slug ?? '—'}</td>
                  <td style={{fontSize:12,fontWeight:600,color:'var(--acc)'}}>{basePriceFmt}</td>
                  <td><span className="amt">{schoolPriceFmt}</span></td>
                  <td><code style={{background:'var(--orange2)',color:'var(--orange)',padding:'2px 8px',borderRadius:6,fontSize:11}}>{s.discount_code || s.school_code?.toUpperCase()}</code></td>
                  <td><a href={regUrl} target="_blank" style={{color:'var(--acc)',fontSize:11,textDecoration:'none'}} onClick={e=>e.stopPropagation()}>🔗 {regUrl.replace('https://','')}</a></td>
                  <td><span className={`badge ${s.is_active?'badge-paid':'badge-cancelled'}`}>{s.is_active?'Active':'Inactive'}</span></td>
                  {isSuperAdmin&&<td><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>onEdit(s)}>Edit</button></td>}
                </tr>
              );
            })
          }
        </tbody>
      </table></div>
    </>
  );
}

// ── Discount Form ───────────────────────────────────────────────────
function DiscountFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({ id:initial.id??'', school_id:initial.school_id??'', code:initial.code??'', discount_amount:initial.discount_amount?String(initial.discount_amount/100):'', max_uses:initial.max_uses??'', expires_at:initial.expires_at?.slice(0,10)??'', is_active:initial.is_active!==false });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Discount Code':'New Discount Code'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School *"><select style={SS} value={f.school_id} onChange={set('school_id')} disabled={!!f.id}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Code *"><input style={{...IS,textTransform:'uppercase'}} value={f.code} onChange={set('code')} placeholder="EARLY200" disabled={!!f.id}/></Field>
        <Field label="Discount Amount (₹) *"><input style={IS} type="number" value={f.discount_amount} onChange={set('discount_amount')} placeholder="200"/></Field>
        <Field label="Max Uses (blank = unlimited)"><input style={IS} type="number" value={f.max_uses} onChange={set('max_uses')} placeholder="100"/></Field>
        <Field label="Expires At (optional)"><input style={IS} type="date" value={f.expires_at} onChange={set('expires_at')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="d_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="d_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({...f,discount_amount:Math.round(Number(f.discount_amount)*100)})}>{f.id?'Save Changes':'Create Code'}</button>
      </div>
    </ModalShell>
  );
}

// ── User Form ───────────────────────────────────────────────────────
function UserFormModal({ schools, onClose, onSave }:{ schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({ email:'', password:'', role:'school_admin', school_id:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p=>({...p,[k]:e.target.value}));
  return (
    <ModalShell title="Add Admin User" onClose={onClose}>
      <Field label="Email *"><input style={IS} type="email" value={f.email} onChange={set('email')} placeholder="admin@example.com"/></Field>
      <Field label="Password *"><input style={IS} type="password" value={f.password} onChange={set('password')} placeholder="Minimum 8 characters"/></Field>
      <Field label="Role *"><select style={SS} value={f.role} onChange={set('role')}><option value="school_admin">School Admin</option><option value="super_admin">Super Admin</option></select></Field>
      {f.role==='school_admin'&&<Field label="Assign to School *"><select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>)}</select></Field>}
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>Create Admin User</button>
      </div>
    </ModalShell>
  );
}

// ── Integration Form ────────────────────────────────────────────────
const INT_FIELDS:Record<string,{label:string;key:string;type?:string}[]> = {
  razorpay:       [{label:'Key ID',key:'rzp_key_id'},{label:'Key Secret',key:'rzp_key_secret',type:'password'},{label:'Webhook Secret',key:'rzp_webhook_secret',type:'password'}],
  cashfree:       [{label:'App ID',key:'cf_app_id'},{label:'Secret Key',key:'cf_secret',type:'password'},{label:'Mode',key:'cf_mode'}],
  easebuzz:       [{label:'Key',key:'eb_key'},{label:'Salt',key:'eb_salt',type:'password'},{label:'Env (production/test)',key:'eb_env'}],
  paypal:         [{label:'Client ID',key:'pp_client_id'},{label:'Client Secret',key:'pp_client_secret',type:'password'},{label:'Mode (live/sandbox)',key:'pp_mode'}],
  smtp:           [{label:'Host',key:'host'},{label:'Port',key:'port'},{label:'User',key:'user'},{label:'Password',key:'password',type:'password'},{label:'From Email',key:'from_email'},{label:'From Name',key:'from_name'}],
  sendgrid:       [{label:'API Key',key:'api_key',type:'password'},{label:'From Email',key:'from_email'},{label:'From Name',key:'from_name'}],
  aws_ses:        [{label:'Region',key:'region'},{label:'Access Key ID',key:'access_key_id'},{label:'Secret Access Key',key:'secret_access_key',type:'password'},{label:'From Email',key:'from_email'}],
  whatsapp_cloud: [{label:'Phone Number ID',key:'phone_number_id'},{label:'Token',key:'token',type:'password'}],
  twilio:         [{label:'Account SID',key:'account_sid'},{label:'Auth Token',key:'auth_token',type:'password'},{label:'WhatsApp From Number',key:'whatsapp_from'}],
};

function IntegrationFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [provider, setProvider] = useState(initial.provider??'razorpay');
  const [config, setConfig]     = useState<Record<string,string>>(initial.config??{});
  const [schoolId, setSchoolId] = useState(initial.school_id??'');
  const [priority, setPriority] = useState(initial.priority??0);
  const fields = INT_FIELDS[provider]??[];
  return (
    <ModalShell title={initial.id?'Edit Integration':'Add Integration'} onClose={onClose}>
      {!initial.id && (
        <Field label="Provider">
          <select style={SS} value={provider} onChange={e=>{ setProvider(e.target.value); setConfig({}); }}>
            <optgroup label="Payment Gateways"><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option><option value="easebuzz">Easebuzz</option><option value="paypal">PayPal</option></optgroup>
            <optgroup label="Email"><option value="smtp">SMTP</option><option value="sendgrid">SendGrid</option><option value="aws_ses">AWS SES</option></optgroup>
            <optgroup label="WhatsApp"><option value="whatsapp_cloud">WhatsApp Cloud API</option><option value="twilio">Twilio</option></optgroup>
          </select>
        </Field>
      )}
      <Field label="School (leave blank for global)">
        <select style={SS} value={schoolId} onChange={e=>setSchoolId(e.target.value)}>
          <option value="">Global (all schools)</option>
          {schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Priority (lower = higher priority)">
        <input style={IS} type="number" value={priority} onChange={e=>setPriority(Number(e.target.value))} placeholder="0"/>
      </Field>
      {fields.map(f=>(
        <Field key={f.key} label={f.label}>
          <input style={IS} type={f.type??'text'} value={config[f.key]??''} onChange={e=>setConfig(p=>({...p,[f.key]:e.target.value}))} placeholder={f.label}/>
        </Field>
      ))}
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({id:initial.id,provider,school_id:schoolId||null,priority,config,is_active:true})}>{initial.id?'Save Changes':'Save Integration'}</button>
      </div>
    </ModalShell>
  );
}

// ── Trigger Form ────────────────────────────────────────────────────
function TriggerFormModal({ initial, schools, templates, onClose, onSave }:{ initial:Row; schools:Row[]; templates:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({ id:initial.id??'', school_id:initial.school_id??'', event_type:initial.event_type??'registration.created', channel:initial.channel??'email', template_id:initial.template_id??'', is_active:initial.is_active!==false });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  const filteredTemplates = templates.filter(t=>t.channel===f.channel);
  return (
    <ModalShell title={f.id?'Edit Trigger':'New Trigger'} onClose={onClose}>
      <Field label="Event *">
        <select style={SS} value={f.event_type} onChange={set('event_type')}>
          <option value="registration.created">Registration Created</option>
          <option value="payment.paid">Payment Paid</option>
          <option value="payment.failed">Payment Failed</option>
          <option value="payment.cancelled">Payment Cancelled</option>
          <option value="discount.applied">Discount Applied</option>
        </select>
      </Field>
      <Field label="Channel *">
        <select style={SS} value={f.channel} onChange={set('channel')}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select>
      </Field>
      <Field label="Template *">
        <select style={SS} value={f.template_id} onChange={set('template_id')}>
          <option value="">Select template</option>
          {filteredTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {filteredTemplates.length===0&&<p style={{fontSize:11,color:'var(--orange)',marginTop:4}}>No {f.channel} templates yet. Create one in Message Templates first.</p>}
      </Field>
      <Field label="School (blank = all schools)">
        <select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">All Schools</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </Field>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="t_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="t_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Trigger'}</button>
      </div>
    </ModalShell>
  );
}

// ── Template Form ───────────────────────────────────────────────────
function TemplateFormModal({ initial, onClose, onSave }:{ initial:Row; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({ id:initial.id??'', name:initial.name??'', channel:initial.channel??'email', subject:initial.subject??'', body:initial.body??'', is_active:initial.is_active!==false });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Template':'New Template'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Template Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="Payment Confirmation"/></Field>
        <Field label="Channel *"><select style={SS} value={f.channel} onChange={set('channel')}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
      </div>
      {f.channel==='email'&&<Field label="Subject *"><input style={IS} value={f.subject} onChange={set('subject')} placeholder="Your registration is confirmed — {{school_name}}"/></Field>}
      <Field label="Message Body *">
        <textarea style={{...IS,height:160,resize:'vertical'}} value={f.body} onChange={set('body')} placeholder={f.channel==='email'?`Hi {{student_name}},\n\nYour registration for {{school_name}} is confirmed!\n\nAmount: {{amount}}\nTransaction ID: {{txn_id}}\n\nThank you!`:`Hi {{student_name}}! 🎉\nYour registration for {{school_name}} is confirmed.\nAmount: {{amount}} | Txn: {{txn_id}}`}/>
      </Field>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="tm_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="tm_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Template'}</button>
      </div>
    </ModalShell>
  );
}

// ── Location Master Page ────────────────────────────────────────────
const COUNTRY_EMOJI: Record<string,string> = {
  'India':'🇮🇳','United Arab Emirates':'🇦🇪','Saudi Arabia':'🇸🇦','Kuwait':'🇰🇼',
  'Qatar':'🇶🇦','Bahrain':'🇧🇭','Oman':'🇴🇲','Singapore':'🇸🇬','Malaysia':'🇲🇾',
  'Indonesia':'🇮🇩','Thailand':'🇹🇭','Philippines':'🇵🇭','Vietnam':'🇻🇳',
  'Myanmar':'🇲🇲','Cambodia':'🇰🇭','Sri Lanka':'🇱🇰','Nepal':'🇳🇵',
  'Bangladesh':'🇧🇩','Pakistan':'🇵🇰',
};

function LocationFormModal({ initial, existingCountries, existingStates, onClose, onSave }:{
  initial: Row; existingCountries: string[]; existingStates: string[]; onClose:()=>void; onSave:(d:Row)=>void
}) {
  const [f,setF] = useState({
    id:         initial.id??'',
    country:    initial.country??'India',
    state:      initial.state??'',
    city:       initial.city??'',
    sort_order: initial.sort_order??0,
  });
  const [addingCountry, setAddingCountry] = useState(false);
  const [newCountry,    setNewCountry]    = useState('');
  const [addingState,   setAddingState]   = useState(false);
  const [newState,      setNewState]      = useState('');

  const allCountries = [...new Set([...existingCountries, f.country].filter(Boolean))].sort((a,b)=>{
    if(a==='India') return -1; if(b==='India') return 1; return a.localeCompare(b);
  });
  const statesForCountry = [...new Set([...existingStates, f.state].filter(Boolean))].sort();

  const handleAddCountry = () => {
    if (!newCountry.trim()) return;
    setF(p=>({...p, country: newCountry.trim(), state:''}));
    setAddingCountry(false); setNewCountry('');
  };
  const handleAddState = () => {
    if (!newState.trim()) return;
    setF(p=>({...p, state: newState.trim()}));
    setAddingState(false); setNewState('');
  };

  return (
    <ModalShell title={f.id?'Edit Location':'Add Location'} onClose={onClose}>
      {/* Country */}
      <Field label="Country *">
        {addingCountry ? (
          <div style={{display:'flex',gap:6}}>
            <input style={{...IS,flex:1}} value={newCountry} onChange={e=>setNewCountry(e.target.value)} placeholder="Enter new country name" autoFocus/>
            <button onClick={handleAddCountry} style={{background:'var(--acc)',color:'#fff',border:'none',borderRadius:8,padding:'0 14px',cursor:'pointer',fontWeight:600,fontSize:12}}>Add</button>
            <button onClick={()=>{setAddingCountry(false);setNewCountry('');}} style={{background:'var(--bd)',color:'var(--m)',border:'none',borderRadius:8,padding:'0 10px',cursor:'pointer',fontSize:12}}>✕</button>
          </div>
        ) : (
          <div style={{display:'flex',gap:6}}>
            <select style={{...SS,flex:1}} value={f.country} onChange={e=>setF(p=>({...p,country:e.target.value,state:''}))}>
              <option value="">Select Country</option>
              {allCountries.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={()=>setAddingCountry(true)} title="Add new country" style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:8,padding:'0 12px',cursor:'pointer',fontWeight:700,fontSize:16,lineHeight:1}}>+</button>
          </div>
        )}
      </Field>

      {/* State */}
      <Field label="State / Region *">
        {addingState ? (
          <div style={{display:'flex',gap:6}}>
            <input style={{...IS,flex:1}} value={newState} onChange={e=>setNewState(e.target.value)} placeholder="Enter new state / region" autoFocus/>
            <button onClick={handleAddState} style={{background:'var(--acc)',color:'#fff',border:'none',borderRadius:8,padding:'0 14px',cursor:'pointer',fontWeight:600,fontSize:12}}>Add</button>
            <button onClick={()=>{setAddingState(false);setNewState('');}} style={{background:'var(--bd)',color:'var(--m)',border:'none',borderRadius:8,padding:'0 10px',cursor:'pointer',fontSize:12}}>✕</button>
          </div>
        ) : (
          <div style={{display:'flex',gap:6}}>
            <select style={{...SS,flex:1}} value={f.state} onChange={e=>setF(p=>({...p,state:e.target.value}))}>
              <option value="">Select State</option>
              {statesForCountry.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={()=>setAddingState(true)} title="Add new state" style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:8,padding:'0 12px',cursor:'pointer',fontWeight:700,fontSize:16,lineHeight:1}}>+</button>
          </div>
        )}
        <p style={{fontSize:10,color:'var(--m)',marginTop:3}}>Click + to add a country/state not in the list — it will appear in future dropdowns.</p>
      </Field>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="City (leave blank to add state only)">
          <input style={IS} value={f.city} onChange={e=>setF(p=>({...p,city:e.target.value}))} placeholder="New Delhi"/>
        </Field>
        <Field label="Sort Order">
          <input style={IS} type="number" value={f.sort_order} onChange={e=>setF(p=>({...p,sort_order:Number(e.target.value)}))} min={0}/>
        </Field>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Add Location'}</button>
      </div>
    </ModalShell>
  );
}

function LocationMasterPage({ rows, BACKEND, onReload, showToast }:{
  rows:Row[]; BACKEND:string; onReload:()=>void; showToast:(t:string,i?:string)=>void
}) {
  const [activeCountry, setActiveCountry] = useState('');
  const [activeState,   setActiveState]   = useState('');
  const [search,        setSearch]        = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editRow,       setEditRow]       = useState<Row|undefined>();
  const [saving,        setSaving]        = useState(false);

  // Derive country list from data
  const countries = [...new Set(rows.map(r=>r.country))].sort((a,b)=>{
    // India first, then alphabetical
    if(a==='India') return -1; if(b==='India') return 1;
    return a.localeCompare(b);
  });

  // Auto-select first country
  React.useEffect(()=>{
    if(!activeCountry && countries.length) setActiveCountry(countries[0]);
  }, [countries.length]);

  // Derive state list for active country
  const statesInCountry = [...new Set(
    rows.filter(r=>r.country===activeCountry).map(r=>r.state)
  )].sort();

  // Auto-select first state
  React.useEffect(()=>{ setActiveState(''); },[activeCountry]);
  React.useEffect(()=>{
    if(!activeState && statesInCountry.length) setActiveState(statesInCountry[0]);
  },[statesInCountry.length, activeCountry]);

  // Cities (or state-level entries) for the active state
  const citiesInState = rows.filter(r=>
    r.country===activeCountry &&
    r.state===activeState &&
    (search==='' || r.city?.toLowerCase().includes(search.toLowerCase()) || r.state?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.city??'').localeCompare(b.city??''));

  const filteredCountries = countries.filter(c=>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const activeCount  = rows.filter(r=>r.is_active).length;
  const countryCount = countries.length;
  const stateCount   = [...new Set(rows.map(r=>r.country+'|'+r.state))].length;

  async function toggleActive(row:Row) {
    await fetch(`${BACKEND}/api/admin/location`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:row.id,is_active:!row.is_active}),
    });
    onReload();
  }

  async function deleteRow(row:Row) {
    if(!confirm(`Delete "${row.city||row.state}"?`)) return;
    await fetch(`${BACKEND}/api/admin/location`,{
      method:'DELETE',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:row.id}),
    });
    showToast('Deleted','✅'); onReload();
  }

  async function handleSave(d:Row) {
    setSaving(true);
    const method = d.id ? 'PATCH' : 'POST';
    const res = await fetch(`${BACKEND}/api/admin/location`,{
      method, headers:{'Content-Type':'application/json'},
      body: JSON.stringify(d),
    });
    const json = await res.json();
    setSaving(false);
    if(!res.ok){ showToast(json.error||'Failed','❌'); return; }
    showToast(d.id?'Updated!':'Added!','✅');
    setModalOpen(false); setEditRow(undefined);
    onReload();
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Location <span>Master</span></h1>
          <p>Countries, states & cities used across all school forms and registration pages</p>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={()=>{setEditRow(undefined);setModalOpen(true);}}>+ Add Location</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        {[
          {label:'Total Entries', value:rows.length,     color:'var(--acc)'},
          {label:'Active',        value:activeCount,     color:'#4ADE80'},
          {label:'Countries',     value:countryCount,    color:'#f59e0b'},
          {label:'States/Regions',value:stateCount,      color:'var(--m)'},
        ].map(s=>(
          <div key={s.label} style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontWeight:800,fontSize:22,color:s.color,fontFamily:'Sora'}}>{s.value}</span>
            <span style={{fontSize:11,color:'var(--m)',fontWeight:500}}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Two-panel layout */}
      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:12,height:'calc(100vh - 300px)',minHeight:0}}>

        {/* Left — country list */}
        <div style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:10,borderBottom:'1px solid var(--bd)'}}>
            <input
              placeholder="Search countries…"
              value={countrySearch}
              onChange={e=>setCountrySearch(e.target.value)}
              style={{...IS,padding:'8px 12px',fontSize:12}}
            />
          </div>
          <div style={{flex:1,overflowY:'auto',padding:6}}>
            {filteredCountries.map(c=>{
              const cnt = rows.filter(r=>r.country===c).length;
              const isActive = c===activeCountry;
              return (
                <button key={c} onClick={()=>setActiveCountry(c)}
                  style={{
                    width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 10px',
                    borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',marginBottom:2,
                    background: isActive?'rgba(79,70,229,0.15)':'transparent',
                    borderLeft: isActive?'3px solid var(--acc)':'3px solid transparent',
                    transition:'all .12s',
                  }}>
                  <span style={{fontSize:18,flexShrink:0}}>{COUNTRY_EMOJI[c]??'🌍'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:isActive?700:500,color:isActive?'var(--acc)':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c}</div>
                    <div style={{fontSize:10,color:'var(--m2)'}}>{cnt} entries</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — state tabs + city rows */}
        <div style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* Header */}
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            <span style={{fontSize:28}}>{COUNTRY_EMOJI[activeCountry]??'🌍'}</span>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:'Sora',fontSize:17,fontWeight:800,margin:0,color:'var(--text)'}}>{activeCountry||'Select a country'}</h2>
              <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{statesInCountry.length} states · {rows.filter(r=>r.country===activeCountry).length} entries</div>
            </div>
            <div style={{position:'relative'}}>
              <input
                placeholder="Search cities…"
                value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{...IS,padding:'7px 12px',fontSize:12,width:180}}
              />
            </div>
          </div>

          {/* State tabs */}
          <div style={{display:'flex',gap:6,padding:'10px 14px',borderBottom:'1px solid var(--bd)',overflowX:'auto',flexShrink:0,flexWrap:'nowrap'}}>
            {statesInCountry.map(s=>(
              <button key={s} onClick={()=>setActiveState(s)}
                style={{
                  padding:'5px 14px',borderRadius:20,border:'1.5px solid',cursor:'pointer',
                  fontSize:11,fontWeight:600,whiteSpace:'nowrap',flexShrink:0,
                  background: s===activeState?'var(--acc)':'transparent',
                  borderColor: s===activeState?'var(--acc)':'var(--bd)',
                  color: s===activeState?'#fff':'var(--m)',
                  transition:'all .12s',
                }}>
                {s}
                <span style={{marginLeft:5,fontSize:10,opacity:0.7}}>
                  ({rows.filter(r=>r.country===activeCountry&&r.state===s).length})
                </span>
              </button>
            ))}
          </div>

          {/* City rows */}
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            {citiesInState.length===0 ? (
              <div style={{textAlign:'center',padding:'48px 0',color:'var(--m2)',fontSize:13}}>
                {activeState ? `No entries for ${activeState}. Add cities above.` : 'Select a state tab above.'}
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {citiesInState.map(row=>(
                  <div key={row.id} style={{
                    display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                    borderRadius:9,border:'1px solid var(--bd)',
                    background: row.is_active?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.01)',
                    opacity: row.is_active?1:0.5,
                    transition:'all .12s',
                  }}>
                    <span style={{fontFamily:'monospace',fontSize:11,color:'var(--m2)',width:22,textAlign:'center',flexShrink:0}}>{row.sort_order}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'var(--text)'}}>{row.city||<em style={{color:'var(--m)',fontStyle:'normal',fontSize:12}}>(state-level entry)</em>}</div>
                      <div style={{fontSize:11,color:'var(--m)',marginTop:1}}>{row.state}{row.country!==activeCountry?` · ${row.country}`:''}</div>
                    </div>
                    {/* Active toggle */}
                    <button onClick={()=>toggleActive(row)}
                      title={row.is_active?'Deactivate':'Activate'}
                      style={{background:'none',border:'none',cursor:'pointer',fontSize:18,lineHeight:1,color:row.is_active?'#4ADE80':'rgba(255,255,255,0.2)',flexShrink:0}}>
                      {row.is_active?'●':'○'}
                    </button>
                    {/* Edit */}
                    <button onClick={()=>{setEditRow(row);setModalOpen(true);}}
                      style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,color:'var(--m)',flexShrink:0}}>
                      Edit
                    </button>
                    {/* Delete */}
                    <button onClick={()=>deleteRow(row)}
                      style={{background:'var(--red2,rgba(239,68,68,0.08))',border:'1px solid rgba(239,68,68,0.15)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,color:'var(--red,#ef4444)',flexShrink:0}}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen&&(
        <LocationFormModal
          initial={editRow ?? {country: activeCountry, state: activeState}}
          existingCountries={countries}
          existingStates={statesInCountry}
          onClose={()=>{setModalOpen(false);setEditRow(undefined);}}
          onSave={handleSave}
        />
      )}
    </>
  );
}

// ── Table components ────────────────────────────────────────────────
function StudentsTable({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  const [search,setSearch]=useState('');const [status,setStatus]=useState('');const [gateway,setGateway]=useState('');const [city,setCity]=useState('');const [cls,setCls]=useState('');const [gender,setGender]=useState('');
  const statuses=[...new Set(rows.map(r=>r.payment_status).filter(Boolean))];
  const gateways=[...new Set(rows.map(r=>r.gateway).filter(Boolean))];
  const cities=[...new Set(rows.map(r=>r.city).filter(Boolean))].sort();
  const classes=[...new Set(rows.map(r=>r.class_grade).filter(Boolean))].sort();
  const filtered=rows.filter(r=>{const hay=[r.student_name,r.parent_name,r.contact_phone,r.contact_email,r.parent_school,r.city,r.gateway_txn_id].join(' ').toLowerCase();return(!search||hay.includes(search.toLowerCase()))&&(!status||r.payment_status===status)&&(!gateway||r.gateway===gateway)&&(!city||r.city===city)&&(!cls||r.class_grade===cls)&&(!gender||r.gender===gender);});
  return (<>
    <div className="table-toolbar">
      <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select value={status}  onChange={e=>setStatus(e.target.value)}>  <option value="">All Status</option>   {statuses.map(s=><option key={s}>{s}</option>)}</select>
      <select value={gateway} onChange={e=>setGateway(e.target.value)}><option value="">All Gateways</option>{gateways.map(g=><option key={g}>{g}</option>)}</select>
      <select value={city}    onChange={e=>setCity(e.target.value)}>    <option value="">All Cities</option>   {cities.map(c=><option key={c}>{c}</option>)}</select>
      <select value={cls}     onChange={e=>setCls(e.target.value)}>     <option value="">All Classes</option>  {classes.map(c=><option key={c}>{c}</option>)}</select>
      <select value={gender}  onChange={e=>setGender(e.target.value)}>  <option value="">All Gender</option>   {['Male','Female','Other'].map(g=><option key={g}>{g}</option>)}</select>
      <span style={{fontSize:12,color:'var(--m)',marginLeft:'auto'}}>{filtered.length} of {rows.length}</span>
    </div>
    <div className="tbl-wrap"><table>
      <thead><tr>{['#','Date','Status','Student','Gender','Class','School','City','Parent','Phone','Gateway','Amount','Discount'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={13} className="table-empty">No records found</td></tr>:filtered.map((r,i)=>(
        <tr key={r.id} onClick={()=>onRowClick(r)}>
          <td style={{color:'var(--m2)',fontSize:11}}>{i+1}</td>
          <td style={{color:'var(--m)',fontSize:11}}>{r.created_at?.slice(0,10)}</td>
          <td><span className={`badge badge-${r.payment_status??'pending'}`}>{r.payment_status??'pending'}</span></td>
          <td><div style={{fontWeight:700}}>{r.student_name}</div></td>
          <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:6,fontWeight:600,background:r.gender==='Male'?'#eff6ff':r.gender==='Female'?'#fdf2f8':'var(--bg)',color:r.gender==='Male'?'#2563eb':r.gender==='Female'?'#db2777':'var(--m)'}}>{r.gender??'—'}</span></td>
          <td><span style={{fontSize:11,background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontWeight:600}}>{r.class_grade??'—'}</span></td>
          <td style={{fontSize:12}}>{r.parent_school??'—'}</td>
          <td style={{fontSize:12}}>{r.city??'—'}</td>
          <td style={{fontSize:12}}>{r.parent_name??'—'}</td>
          <td><a href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()} style={{color:'var(--acc)',fontSize:12,textDecoration:'none',fontWeight:600}}>{r.contact_phone}</a></td>
          <td><span className="gw-tag">{r.gateway??'—'}</span></td>
          <td><span className="amt">₹{fmtR(r.final_amount??0)}</span></td>
          <td style={{fontSize:11,color:'var(--red)',fontWeight:600}}>{r.discount_code?`🏷️ ${r.discount_code}`:'—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  </>);
}

function FollowUpList({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  if(!rows.length) return <div className="empty-state"><div className="emoji">🎉</div><p>No pending follow-ups!</p></div>;
  return <div className="followup-card">{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="followup-item" onClick={()=>onRowClick(r)}><div className={`fu-avatar ${st}`}>{(r.student_name??'?')[0].toUpperCase()}</div><div className="fu-info"><div className="fu-name">{r.student_name} <span className={`fu-tag ${st}`}>{r.payment_status}</span></div><div className="fu-meta">{r.class_grade} · {r.parent_school} · {r.city}</div></div><div className="fu-actions"><a className="fu-btn wa" href={`https://wa.me/91${r.contact_phone}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>💬 WA</a><a className="fu-btn call" href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()}>📞 Call</a></div><div style={{textAlign:'right',marginLeft:8}}><div className="amt" style={{fontSize:13}}>₹{fmtR(r.final_amount??0)}</div><div style={{fontSize:10,color:'var(--m2)'}}>{r.gateway}</div></div></div>);})}</div>;
}

function CityHeatmap({ rows }:{ rows:Row[] }) {
  const [metric,setMetric]=useState<'total'|'paid'|'revenue'>('total');
  const cd:Record<string,{total:number;paid:number;revenue:number}>={};
  rows.forEach(r=>{const c=r.city??'Unknown';if(!cd[c])cd[c]={total:0,paid:0,revenue:0};cd[c].total++;if(r.payment_status==='paid'){cd[c].paid++;cd[c].revenue+=r.final_amount??0;}});
  const sorted=Object.entries(cd).sort((a,b)=>b[1][metric]-a[1][metric]);
  const mx=sorted[0]?.[1][metric]??1;
  const colors=['#4f46e5','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'];
  return <><div style={{display:'flex',gap:8,marginBottom:20}}>{(['total','paid','revenue'] as const).map(m=><button key={m} className={`period-tab${metric===m?' active':''}`} onClick={()=>setMetric(m)} style={{border:'1.5px solid var(--bd)',borderRadius:8,padding:'6px 14px',background:metric===m?'var(--card)':'none',cursor:'pointer',fontSize:12,fontWeight:600,color:metric===m?'var(--acc)':'var(--m)'}}>{m.charAt(0).toUpperCase()+m.slice(1)}</button>)}</div>
  <div className="heatmap-grid">{sorted.map(([city,data])=>{const val=data[metric];const pct=val/mx;const ci=Math.min(Math.floor(pct*colors.length),colors.length-1);return(<div key={city} className="heatmap-cell" style={{background:colors[ci]+'22',border:`2px solid ${colors[ci]}66`}}><div className="heatmap-name">{city}</div><div className="heatmap-count" style={{color:colors[ci]}}>{metric==='revenue'?`₹${fmtR(val)}`:val}</div><div className="heatmap-rev">{data.paid} paid · {data.total} total</div></div>);})}</div></>;
}

function Timeline({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  const dc:Record<string,string>={paid:'paid',failed:'failed',initiated:'initiated',cancelled:'cancelled',pending:'initiated'};
  const de:Record<string,string>={paid:'✅',failed:'❌',initiated:'⏳',cancelled:'🚫',pending:'⏳'};
  return <div>{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="tl-item" onClick={()=>onRowClick(r)}><div className={`tl-dot ${dc[st]??'initiated'}`}>{de[st]??'⏳'}</div><div className="tl-info"><div className="tl-name">{r.student_name} <span style={{fontWeight:400,color:'var(--m)',fontSize:12}}>· {r.class_grade} · {r.parent_school}</span></div><div className="tl-meta">{r.gateway} · {r.city} · {r.contact_phone}</div></div><div style={{textAlign:'right'}}><div className="tl-amt">₹{fmtR(r.final_amount??0)}</div><div className="tl-time">{r.created_at?.slice(0,10)}</div></div></div>);})}</div>;
}
