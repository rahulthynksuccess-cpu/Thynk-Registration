'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const PALETTE = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#0891b2'];
function fmt(n: any) { const v = parseFloat(String(n??0).replace(/[^0-9.]/g,'')); return isNaN(v)?'0':v.toLocaleString('en-IN'); }
function fmtRupees(p: number) { return fmt(p/100); }

type Row = Record<string,any>;

const NAV = [
  { section: 'Analytics' },
  { id:'overview',      icon:'🏠', label:'Overview' },
  { id:'students',      icon:'👨‍🎓', label:'Students' },
  { id:'trends',        icon:'📈', label:'Trends' },
  { id:'analytics',     icon:'🔬', label:'Analytics' },
  { section: 'Actions' },
  { id:'followup',      icon:'📞', label:'Follow-Up',    badge:true },
  { id:'heatmap',       icon:'🗺️',  label:'City Heatmap' },
  { id:'recent',        icon:'🕐', label:'Recent Activity' },
  { section: 'Management' },
  { id:'projects',      icon:'🗂️', label:'Projects',      superOnly:true },
  { id:'schools',       icon:'🏫', label:'Schools' },
  { id:'pricing',       icon:'💰', label:'Pricing' },
  { id:'discounts',     icon:'🏷️', label:'Discount Codes' },
  { id:'users',         icon:'👥', label:'Admin Users' },
  { section: 'Automations' },
  { id:'integrations',  icon:'🔌', label:'Integrations' },
  { id:'triggers',      icon:'⚡', label:'Triggers' },
  { id:'templates',     icon:'✉️', label:'Templates' },
  { section: 'Platform' },
  { id:'activity',      icon:'🔍', label:'Activity Log',  superOnly:true },
  { section: 'Tools' },
  { id:'_export',       icon:'⬇️', label:'Export CSV',    action:true },
  { id:'_refresh',      icon:'🔄', label:'Refresh',       action:true },
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
  const [schools, setSchools]           = useState<Row[]>([]);
  const [projects, setProjects]         = useState<Row[]>([]);
  const [pricingList, setPricingList]   = useState<Row[]>([]);
  const [discounts, setDiscounts]       = useState<Row[]>([]);
  const [adminUsers, setAdminUsers]     = useState<Row[]>([]);
  const [integrations, setIntegrations] = useState<Row[]>([]);
  const [triggers, setTriggers]         = useState<Row[]>([]);
  const [templates, setTemplates]       = useState<Row[]>([]);
  const [activityLogs, setActivityLogs] = useState<Row[]>([]);

  // Modal forms
  const [schoolForm, setSchoolForm]         = useState<Row|null>(null);
  const [projectForm, setProjectForm]       = useState<Row|null>(null);
  const [pricingForm, setPricingForm]       = useState<Row|null>(null);
  const [discountForm, setDiscountForm]     = useState<Row|null>(null);
  const [userForm, setUserForm]             = useState<Row|null>(null);
  const [integrationForm, setIntegrationForm] = useState<Row|null>(null);
  const [triggerForm, setTriggerForm]       = useState<Row|null>(null);
  const [templateForm, setTemplateForm]     = useState<Row|null>(null);

  const chartsRef  = useRef<Record<string,any>>({});
  const toastTimer = useRef<any>();

  // Auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/admin/login'); return; }
      setUser(data.user);
      const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', data.user.id).eq('role','super_admin').is('school_id',null).maybeSingle();
      setSuperAdmin(!!role);
    });
  }, [router]);

  // Data loaders
  const loadRegistrations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/registrations?limit=1000');
      const data = await res.json();
      const rows = (data.rows??[]).filter((r:Row) => r.student_name?.trim());
      setAllRows(rows);
      setLastUpdated(`Last updated ${new Date().toLocaleTimeString('en-IN')} · ${rows.length} records`);
      showToast(`Loaded ${rows.length} records`, '✅');
    } catch(e:any) { showToast('Load error: '+e.message, '❌'); }
    finally { setLoading(false); }
  }, []);

  const loadSchools      = useCallback(async () => { const r = await fetch('/api/admin/schools');      const d = await r.json(); setSchools(d.schools??[]); }, []);
  const loadProjects     = useCallback(async () => { const r = await fetch('/api/admin/projects');     const d = await r.json(); setProjects(d.projects??[]); }, []);
  const loadPricing      = useCallback(async () => { const r = await fetch('/api/admin/pricing');      const d = await r.json(); setPricingList(d.pricing??[]); }, []);
  const loadDiscounts    = useCallback(async () => { const r = await fetch('/api/admin/discounts');    const d = await r.json(); setDiscounts(d.discounts??[]); }, []);
  const loadUsers        = useCallback(async () => { const r = await fetch('/api/admin/users');        const d = await r.json(); setAdminUsers(d.users??[]); }, []);
  const loadIntegrations = useCallback(async () => { const r = await fetch('/api/admin/integrations'); const d = await r.json(); setIntegrations(d.integrations??[]); }, []);
  const loadTriggers     = useCallback(async () => { const r = await fetch('/api/admin/triggers');     const d = await r.json(); setTriggers(d.triggers??[]); }, []);
  const loadTemplates    = useCallback(async () => { const r = await fetch('/api/admin/templates');    const d = await r.json(); setTemplates(d.templates??[]); }, []);
  const loadActivity     = useCallback(async () => { const r = await fetch('/api/admin/activity-logs'); const d = await r.json(); setActivityLogs(d.logs??[]); }, []);

  useEffect(() => { if (!user) return; loadRegistrations(); const t = setInterval(loadRegistrations, 10*60*1000); return () => clearInterval(t); }, [user, loadRegistrations]);

  useEffect(() => {
    if (!user) return;
    if (activePage === 'schools')      loadSchools();
    if (activePage === 'projects')     { loadProjects(); loadSchools(); }
    if (activePage === 'pricing')      { loadPricing(); loadSchools(); }
    if (activePage === 'discounts')    { loadDiscounts(); loadSchools(); }
    if (activePage === 'users')        { loadUsers(); loadSchools(); }
    if (activePage === 'integrations') { loadIntegrations(); loadSchools(); }
    if (activePage === 'triggers')     { loadTriggers(); loadTemplates(); loadSchools(); }
    if (activePage === 'templates')    { loadTemplates(); loadSchools(); }
    if (activePage === 'activity')     loadActivity();
  }, [activePage, user]);

  function showToast(text:string, icon='') {
    setToast({ text:`${icon} ${text}`.trim(), type: icon==='✅'?'ok':icon==='❌'?'err':'' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast({text:'',type:''}), 3500);
  }

  async function doLogout() { await createClient().auth.signOut(); router.push('/admin/login'); }

  // Charts
  useEffect(() => {
    if (!allRows.length) return;
    if (activePage==='overview')  renderOverviewCharts();
    if (activePage==='trends')    renderTrendCharts();
    if (activePage==='analytics') renderAnalyticsCharts();
  }, [activePage, allRows, trendDays]);

  function destroyChart(id:string) { if(chartsRef.current[id]){chartsRef.current[id].destroy();delete chartsRef.current[id];} }

  function renderOverviewCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;
    const paid = allRows.filter(r=>r.payment_status==='paid');
    const now = new Date();
    destroyChart('daily');
    const labels:string[]=[],paidArr:number[]=[],totalArr:number[]=[];
    for(let i=trendDays-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);labels.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);totalArr.push(day.length);paidArr.push(day.filter(r=>r.payment_status==='paid').length);}
    const ctxD=(document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if(ctxD) chartsRef.current.daily=new C(ctxD,{type:'bar',data:{labels,datasets:[{label:'Total',data:totalArr,backgroundColor:'rgba(79,70,229,.12)',borderColor:'#4f46e5',borderWidth:2,borderRadius:8,borderSkipped:false},{label:'Paid',data:paidArr,backgroundColor:'rgba(16,185,129,.8)',borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}}}});
    destroyChart('status');
    const sc:Record<string,number>={};allRows.forEach(r=>{const s=r.payment_status??'unknown';sc[s]=(sc[s]??0)+1;});
    const colorMap:Record<string,string>={paid:'#10b981',initiated:'#4f46e5',pending:'#f59e0b',failed:'#ef4444',cancelled:'#94a3b8'};
    const ctxS=(document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if(ctxS){const sl=Object.keys(sc);chartsRef.current.status=new C(ctxS,{type:'doughnut',data:{labels:sl,datasets:[{data:Object.values(sc),backgroundColor:sl.map(l=>colorMap[l]??'#94a3b8'),borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},cutout:'65%',onClick:(_:any,els:any[])=>{if(els.length)drillDown('Status: '+sl[els[0].index],allRows.filter(r=>(r.payment_status??'unknown')===sl[els[0].index]))}}});}
    destroyChart('gw');
    const gc:Record<string,number>={};paid.forEach(r=>{const g=r.gateway??'Unknown';gc[g]=(gc[g]??0)+1;});
    const ctxG=(document.getElementById('chartGW') as HTMLCanvasElement)?.getContext('2d');
    if(ctxG&&Object.keys(gc).length){const gl=Object.keys(gc);chartsRef.current.gw=new C(ctxG,{type:'pie',data:{labels:gl,datasets:[{data:Object.values(gc),backgroundColor:PALETTE.slice(0,gl.length),borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});}
  }

  function renderTrendCharts() {
    if (!(window as any).Chart) return;
    const C=(window as any).Chart,now=new Date();
    destroyChart('trend');
    const tl:string[]=[],tt:number[]=[],tp:number[]=[],tr:number[]=[];
    for(let i=29;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);tl.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);tt.push(day.length);tp.push(day.filter(r=>r.payment_status==='paid').length);tr.push(day.filter(r=>r.payment_status==='paid').reduce((s:number,r:Row)=>s+(r.final_amount??0),0));}
    const ctxT=(document.getElementById('chartTrend') as HTMLCanvasElement)?.getContext('2d');
    if(ctxT) chartsRef.current.trend=new C(ctxT,{data:{labels:tl,datasets:[{type:'bar',label:'Total',data:tt,backgroundColor:'rgba(79,70,229,.1)',borderColor:'#4f46e5',borderWidth:1.5,borderRadius:6,yAxisID:'y'},{type:'bar',label:'Paid',data:tp,backgroundColor:'rgba(16,185,129,.7)',borderRadius:6,yAxisID:'y'},{type:'line',label:'Revenue',data:tr,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,.08)',borderWidth:2.5,pointRadius:3,fill:true,tension:.4,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1},position:'left'},y2:{beginAtZero:true,position:'right',grid:{display:false},ticks:{callback:(v:number)=>'₹'+fmt(v/100)}},x:{grid:{display:false}}}}});
    destroyChart('hourly');
    const hours=new Array(24).fill(0);allRows.forEach(r=>{const h=parseInt((r.created_at??'').slice(11,13));if(!isNaN(h)&&h>=0&&h<24)hours[h]++;});
    const ctxH=(document.getElementById('chartHourly') as HTMLCanvasElement)?.getContext('2d');
    if(ctxH) chartsRef.current.hourly=new C(ctxH,{type:'bar',data:{labels:Array.from({length:24},(_,i)=>i+':00'),datasets:[{data:hours,backgroundColor:hours.map(v=>v>0?'rgba(139,92,246,.75)':'rgba(139,92,246,.1)'),borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false},ticks:{maxRotation:0,font:{size:10}}}}}});
  }

  function renderAnalyticsCharts() {
    if (!(window as any).Chart) return;
    const C=(window as any).Chart;
    const paid=allRows.filter(r=>r.payment_status==='paid');
    destroyChart('gender');
    const gc:Record<string,number>={};allRows.forEach(r=>{const g=r.gender??'Unknown';gc[g]=(gc[g]??0)+1;});
    const ctxGe=(document.getElementById('chartGender') as HTMLCanvasElement)?.getContext('2d');
    if(ctxGe){const gl=Object.keys(gc);chartsRef.current.gender=new C(ctxGe,{type:'doughnut',data:{labels:gl,datasets:[{data:Object.values(gc),backgroundColor:['#4f46e5','#ec4899','#94a3b8'],borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},cutout:'60%'}});}
    destroyChart('city');
    const cc:Record<string,number>={};allRows.forEach(r=>{const c=r.city??'Unknown';cc[c]=(cc[c]??0)+1;});
    const sc2=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const ctxCi=(document.getElementById('chartCity') as HTMLCanvasElement)?.getContext('2d');
    if(ctxCi) chartsRef.current.city=new C(ctxCi,{type:'bar',data:{labels:sc2.map(e=>e[0]),datasets:[{data:sc2.map(e=>e[1]),backgroundColor:'rgba(79,70,229,.7)',borderRadius:6,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true},y:{grid:{display:false}}}}});
  }

  function drillDown(title:string, rows:Row[]) { setDrillData({title, rows}); }

  function exportCSV() {
    const headers=['Date','Student','Class','Gender','School','City','Parent','Phone','Email','Gateway','Status','Base Amount','Discount Code','Discount Amount','Final Amount','Payment ID','Program'];
    const rows=[headers,...allRows.map(r=>[r.created_at?.slice(0,10),r.student_name,r.class_grade,r.gender,r.parent_school,r.city,r.parent_name,r.contact_phone,r.contact_email,r.gateway,r.payment_status,(r.base_amount??0)/100,r.discount_code,(r.discount_amount??0)/100,(r.final_amount??0)/100,r.gateway_txn_id,r.program_name])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`Thynk_${new Date().toISOString().slice(0,10)}.csv`;a.click();
    showToast('CSV exported!','✅');
  }

  function navAction(id:string) {
    if (id==='_export') { exportCSV(); return; }
    if (id==='_refresh') { loadRegistrations(); return; }
    setActivePage(id);
  }

  const paid=allRows.filter(r=>r.payment_status==='paid');
  const pending=allRows.filter(r=>['pending','initiated'].includes(r.payment_status));
  const failed=allRows.filter(r=>['failed','cancelled'].includes(r.payment_status));
  const totalRev=paid.reduce((s,r)=>s+(r.final_amount??0),0);
  const conv=allRows.length?Math.round(paid.length/allRows.length*100):0;
  const avg=paid.length?Math.round(totalRev/paid.length):0;
  const schoolsSet=new Set(paid.map(r=>r.parent_school).filter(Boolean));
  const citiesSet=new Set(paid.map(r=>r.city).filter(Boolean));
  const today=new Date().toISOString().slice(0,10);
  const thisWeek=allRows.filter(r=>new Date(r.created_at)>=new Date(Date.now()-7*24*60*60*1000)).length;
  const followUpCount=allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status)).length;

  if (!user) return null;

  return (
    <>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" async />
      <div id="admin-toast" className={`${toast.text?'show':''}${toast.type==='ok'?' tok':toast.type==='err'?' terr':''}`}>{toast.text}</div>

      <div className="admin-layout">
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
              if ((item as any).superOnly && !isSuperAdmin) return null;
              const isActive = !(item as any).action && activePage===item.id;
              return (
                <button key={item.id} className={`sb-item${isActive?' active':''}`} onClick={()=>navAction(item.id!)}>
                  <span className="icon">{item.icon}</span>{item.label}
                  {(item as any).badge && followUpCount>0 && <span className="sb-badge">{followUpCount}</span>}
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

        <main className="main-content">

          {/* ── Overview ─────────────────────────────────────────── */}
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
                <div className="rev-val">₹{fmtRupees(totalRev)}</div>
                <div className="rev-sub">From {paid.length} confirmed payments</div>
              </div>
              <div className="rev-stats">
                <div className="rev-stat"><div className="rev-stat-val">{conv}%</div><div className="rev-stat-lbl">Conversion</div></div>
                <div className="rev-stat"><div className="rev-stat-val">₹{fmtRupees(avg)}</div><div className="rev-stat-lbl">Avg ticket</div></div>
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
                {color:'cyan',  icon:'🏫',label:'Schools',  val:schoolsSet.size, sub:'Unique schools'},
                {color:'pink',  icon:'🌆',label:'Cities',   val:citiesSet.size,  sub:'Unique cities'},
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
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📅 Daily Registrations</div><div className="chart-sub">Total vs paid per day</div></div></div><div className="chart-wrap"><canvas id="chartDaily"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">📊 Payment Status</div></div></div><div className="chart-wrap"><canvas id="chartStatus"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">💳 Gateway Split</div></div></div><div className="chart-wrap"><canvas id="chartGW"/></div></div>
            </div>
            <div className="breakdown-grid">
              <BreakdownCard title="🏫 Top Schools" data={Object.entries(paid.reduce((a:Record<string,number>,r)=>{a[r.parent_school??'Unknown']=(a[r.parent_school??'Unknown']??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8)} />
              <BreakdownCard title="🌆 Top Cities"  data={Object.entries(paid.reduce((a:Record<string,number>,r)=>{a[r.city??'Unknown']=(a[r.city??'Unknown']??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8)} />
              <BreakdownCard title="🎓 Classes"     data={Object.entries(allRows.reduce((a:Record<string,number>,r)=>{a[r.class_grade??'Unknown']=(a[r.class_grade??'Unknown']??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8)} />
            </div>
          </div>

          {/* ── Students ─────────────────────────────────────────── */}
          <div className={`page${activePage==='students'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Students <span>Table</span></h1><p>{allRows.length} total records</p></div><div className="topbar-right"><button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button></div></div>
            <StudentsTable rows={allRows} onRowClick={setModal} />
          </div>

          {/* ── Trends ───────────────────────────────────────────── */}
          <div className={`page${activePage==='trends'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Trends <span>Analysis</span></h1></div></div>
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📈 30-Day Trend</div></div></div><div className="chart-wrap tall"><canvas id="chartTrend"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">🕐 Hourly Activity</div></div></div><div className="chart-wrap"><canvas id="chartHourly"/></div></div>
            </div>
          </div>

          {/* ── Analytics ────────────────────────────────────────── */}
          <div className={`page${activePage==='analytics'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Analytics <span>Insights</span></h1></div></div>
            <div className="charts-grid">
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">⚧ Gender Split</div></div></div><div className="chart-wrap"><canvas id="chartGender"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">🌆 Top Cities</div></div></div><div className="chart-wrap tall"><canvas id="chartCity"/></div></div>
            </div>
          </div>

          {/* ── Follow-Up ─────────────────────────────────────────── */}
          <div className={`page${activePage==='followup'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Follow-Up <span>Tracker</span></h1><p>{followUpCount} need follow-up</p></div></div>
            <FollowUpList rows={allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status))} onRowClick={setModal} />
          </div>

          {/* ── Heatmap ───────────────────────────────────────────── */}
          <div className={`page${activePage==='heatmap'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>City <span>Heatmap</span></h1></div></div>
            <CityHeatmap rows={allRows} />
          </div>

          {/* ── Recent ───────────────────────────────────────────── */}
          <div className={`page${activePage==='recent'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Recent <span>Activity</span></h1></div></div>
            <Timeline rows={allRows.slice(0,50)} onRowClick={setModal} />
          </div>

          {/* ── PROJECTS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='projects'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Projects <span>Management</span></h1><p>{projects.length} projects</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setProjectForm({})}>+ New Project</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Name</th><th>Slug</th><th>Domain</th><th>Schools</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {projects.length===0?<tr><td colSpan={6} className="table-empty">No projects yet. Click "New Project" to create one.</td></tr>
                  :projects.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:700}}>{p.name}</td>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12}}>{p.slug}</code></td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{p.domain??'—'}</td>
                      <td style={{fontSize:12}}>{p.schools?.length??0} schools</td>
                      <td><span className={`badge ${p.status==='active'?'badge-paid':'badge-cancelled'}`}>{p.status}</span></td>
                      <td><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setProjectForm(p)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SCHOOLS ──────────────────────────────────────────── */}
          <div className={`page${activePage==='schools'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Schools <span>Management</span></h1><p>{schools.length} schools configured</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setSchoolForm({})}>+ Add School</button>}</div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Project</th><th>Program</th><th>Price</th><th>Status</th><th>Link</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
                <tbody>
                  {schools.length===0?<tr><td colSpan={8} className="table-empty">No schools yet.</td></tr>
                  :schools.map(s=>(
                    <tr key={s.id}>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{s.school_code}</code></td>
                      <td style={{fontWeight:700}}>{s.name}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{s.projects?.name??'—'}</td>
                      <td style={{fontSize:12}}>{s.pricing?.[0]?.program_name??'—'}</td>
                      <td><span className="amt">₹{fmtRupees(s.pricing?.[0]?.base_amount??0)}</span></td>
                      <td><span className={`badge ${s.is_active?'badge-paid':'badge-cancelled'}`}>{s.is_active?'Active':'Inactive'}</span></td>
                      <td><a href={`/${s.school_code}`} target="_blank" style={{color:'var(--acc)',fontSize:12,textDecoration:'none'}} onClick={e=>e.stopPropagation()}>🔗 Open</a></td>
                      {isSuperAdmin&&<td><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setSchoolForm(s)}>Edit</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── PRICING ──────────────────────────────────────────── */}
          <div className={`page${activePage==='pricing'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Pricing <span>Management</span></h1></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setPricingForm({})}>+ Add Pricing</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>School</th><th>Program</th><th>Base Amount</th><th>Currency</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {pricingList.length===0?<tr><td colSpan={7} className="table-empty">No pricing configured yet.</td></tr>
                  :pricingList.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:700}}>{p.schools?.name??p.school_id}</td>
                      <td>{p.program_name}</td>
                      <td><span className="amt">₹{fmtRupees(p.base_amount)}</span></td>
                      <td><span className="gw-tag">{p.currency}</span></td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{p.valid_until?new Date(p.valid_until).toLocaleDateString('en-IN'):'No expiry'}</td>
                      <td><span className={`badge ${p.is_active?'badge-paid':'badge-cancelled'}`}>{p.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setPricingForm(p)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Deactivate?'))return;await fetch('/api/admin/pricing',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,is_active:false})});loadPricing();}}>Off</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── DISCOUNTS ────────────────────────────────────────── */}
          <div className={`page${activePage==='discounts'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Discount <span>Codes</span></h1><p>{discounts.filter(d=>d.is_active).length} active codes</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setDiscountForm({})}>+ New Code</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>School</th><th>Code</th><th>Type</th><th>Discount</th><th>Used / Max</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {discounts.length===0?<tr><td colSpan={8} className="table-empty">No discount codes yet.</td></tr>
                  :discounts.map(d=>(
                    <tr key={d.id}>
                      <td style={{fontSize:12}}>{d.schools?.name??d.school_id}</td>
                      <td><code style={{background:'var(--orange2)',color:'var(--orange)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{d.code}</code></td>
                      <td><span className="gw-tag">{d.discount_type==='percent'?'%':'Fixed'}</span></td>
                      <td style={{color:'var(--green)',fontWeight:700}}>{d.discount_type==='percent'?`${d.discount_value}%`:`₹${fmtRupees(d.discount_amount)}`}</td>
                      <td style={{fontSize:12}}>{d.used_count} / {d.max_uses??'∞'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{d.expires_at?new Date(d.expires_at).toLocaleDateString('en-IN'):'Never'}</td>
                      <td><span className={`badge ${d.is_active?'badge-paid':'badge-cancelled'}`}>{d.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setDiscountForm(d)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Delete ${d.code}?`))return;await fetch('/api/admin/discounts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id})});loadDiscounts();}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ADMIN USERS ──────────────────────────────────────── */}
          <div className={`page${activePage==='users'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Admin <span>Users</span></h1></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setUserForm({})}>+ Add Admin</button>}</div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Email</th><th>Role</th><th>School Access</th><th>Added</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
                <tbody>
                  {adminUsers.length===0?<tr><td colSpan={5} className="table-empty">No admin users yet.</td></tr>
                  :adminUsers.map(u=>(
                    <tr key={u.id}>
                      <td style={{fontWeight:700}}>{u.email}</td>
                      <td><span className={`badge ${u.role==='super_admin'?'badge-paid':'badge-initiated'}`}>{u.role==='super_admin'?'Super Admin':'School Admin'}</span></td>
                      <td style={{fontSize:12}}>{u.role==='super_admin'?'All Schools':u.schools?.name??'—'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                      {isSuperAdmin&&<td><button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Remove ${u.email}?`))return;await fetch('/api/admin/users',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({role_id:u.id})});loadUsers();}}>Remove</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── INTEGRATIONS ─────────────────────────────────────── */}
          <div className={`page${activePage==='integrations'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Integrations <span>Control</span></h1><p>Gateways · Email · WhatsApp</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setIntegrationForm({})}>+ Add Integration</button></div>
            </div>
            <IntegrationsPage integrations={integrations} schools={schools} onEdit={setIntegrationForm} onRefresh={loadIntegrations} showToast={showToast} />
          </div>

          {/* ── TRIGGERS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='triggers'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Triggers <span>Automation</span></h1><p>Fire notifications on events</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setTriggerForm({})}>+ New Trigger</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>School</th><th>Event</th><th>Channel</th><th>Template</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {triggers.length===0?<tr><td colSpan={6} className="table-empty">No triggers configured. Add one to start sending automated notifications.</td></tr>
                  :triggers.map(t=>(
                    <tr key={t.id}>
                      <td style={{fontSize:12}}>{schools.find(s=>s.id===t.school_id)?.name??'Global'}</td>
                      <td><span className="gw-tag" style={{background:'var(--purple2)',color:'var(--purple)'}}>{t.event_type}</span></td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{fontSize:12}}>{t.notification_templates?.name??'—'}</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Off'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTriggerForm(t)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete?'))return;await fetch('/api/admin/triggers',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id})});loadTriggers();}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── TEMPLATES ────────────────────────────────────────── */}
          <div className={`page${activePage==='templates'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Templates <span>Library</span></h1></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setTemplateForm({})}>+ New Template</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Name</th><th>Channel</th><th>Subject</th><th>School</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {templates.length===0?<tr><td colSpan={6} className="table-empty">No templates yet. Create email or WhatsApp message templates.</td></tr>
                  :templates.map(t=>(
                    <tr key={t.id}>
                      <td style={{fontWeight:700}}>{t.name}</td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{t.subject??'—'}</td>
                      <td style={{fontSize:12}}>{schools.find(s=>s.id===t.school_id)?.name??'Global'}</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Off'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTemplateForm(t)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete?'))return;await fetch('/api/admin/templates',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id})});loadTemplates();}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ACTIVITY LOG ─────────────────────────────────────── */}
          <div className={`page${activePage==='activity'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Activity <span>Log</span></h1><p>Full admin audit trail</p></div></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>School</th></tr></thead>
                <tbody>
                  {activityLogs.length===0?<tr><td colSpan={5} className="table-empty">No activity recorded yet.</td></tr>
                  :activityLogs.map(l=>(
                    <tr key={l.id}>
                      <td style={{fontSize:11,color:'var(--m2)',whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleString('en-IN')}</td>
                      <td style={{fontSize:12}}>{l.user_email}</td>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:11}}>{l.action}</code></td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{l.entity_type}{l.entity_id?` · ${l.entity_id.slice(0,8)}…`:''}</td>
                      <td style={{fontSize:12}}>{l.schools?.name??'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>

      {/* Student detail modal */}
      {modal&&(
        <div className="modal-overlay show" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
          <div className="modal">
            <div className="modal-head"><h3>{modal.student_name}</h3><button className="modal-close" onClick={()=>setModal(null)}>✕</button></div>
            <div className="modal-body">
              {[['Status',<span key="s" className={`badge badge-${modal.payment_status??'pending'}`}>{modal.payment_status??'—'}</span>],['Date',modal.created_at?.slice(0,10)??'—'],['Student',modal.student_name],['Class',modal.class_grade],['Gender',modal.gender],['School',modal.parent_school],['City',modal.city],['Parent',modal.parent_name],['Phone',<a key="p" href={`tel:${modal.contact_phone}`} style={{color:'var(--acc)',fontWeight:600}}>{modal.contact_phone}</a>],['Email',<a key="e" href={`mailto:${modal.contact_email}`} style={{color:'var(--acc)',fontSize:12}}>{modal.contact_email}</a>],['Gateway',modal.gateway??'—'],['Base',`₹${fmtRupees(modal.base_amount??0)}`],['Discount',modal.discount_code?`🏷️ ${modal.discount_code} (₹${fmtRupees(modal.discount_amount??0)} off)`:'None'],['Paid',<span key="a" style={{fontFamily:'Sora',fontWeight:800,color:'var(--green)',fontSize:18}}>₹{fmtRupees(modal.final_amount??0)}</span>],['Txn ID',<span key="t" style={{fontSize:11,color:'var(--m2)',wordBreak:'break-all'}}>{modal.gateway_txn_id??'—'}</span>]].map(([l,v])=><div key={String(l)} className="modal-row"><div className="modal-lbl">{l}</div><div className="modal-val">{v}</div></div>)}
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
            <div className="drill-head"><div><h3>{drillData.title}</h3><span className="drill-count">({drillData.rows.length} records)</span></div><button className="drill-close" onClick={()=>setDrillData(null)}>✕</button></div>
            <div className="drill-body">
              {drillData.rows.map((r,i)=>(
                <div key={r.id} className="drill-row" onClick={()=>{setDrillData(null);setTimeout(()=>setModal(r),200);}}>
                  <div className="drill-num">{i+1}</div>
                  <div style={{flex:1}}><div className="drill-name">{r.student_name} <span className={`badge badge-${r.payment_status}`} style={{fontSize:10}}>{r.payment_status}</span></div><div className="drill-meta">{r.class_grade} · {r.parent_school} · {r.city}</div></div>
                  <div style={{textAlign:'right'}}><div className="drill-amt">₹{fmtRupees(r.final_amount??0)}</div><div className="drill-meta">{r.gateway}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Form modals */}
      {projectForm!==null&&<ProjectFormModal initial={projectForm} onClose={()=>setProjectForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/projects',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'Project updated!':'Project created!','✅');setProjectForm(null);loadProjects();}} />}
      {schoolForm!==null&&<SchoolFormModal initial={schoolForm} schools={schools} projects={projects} onClose={()=>setSchoolForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/schools',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'School updated!':'School created!','✅');setSchoolForm(null);loadSchools();}} />}
      {pricingForm!==null&&<PricingFormModal initial={pricingForm} schools={schools} onClose={()=>setPricingForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/pricing',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'Pricing updated!':'Pricing created!','✅');setPricingForm(null);loadPricing();}} />}
      {discountForm!==null&&<DiscountFormModal initial={discountForm} schools={schools} onClose={()=>setDiscountForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/discounts',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'Code updated!':'Code created!','✅');setDiscountForm(null);loadDiscounts();}} />}
      {userForm!==null&&<UserFormModal schools={schools} onClose={()=>setUserForm(null)} onSave={async(data)=>{const res=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast('Admin user created!','✅');setUserForm(null);loadUsers();}} />}
      {integrationForm!==null&&<IntegrationFormModal initial={integrationForm} schools={schools} onClose={()=>setIntegrationForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/integrations',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast('Integration saved!','✅');setIntegrationForm(null);loadIntegrations();}} />}
      {triggerForm!==null&&<TriggerFormModal initial={triggerForm} schools={schools} templates={templates} onClose={()=>setTriggerForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/triggers',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast('Trigger saved!','✅');setTriggerForm(null);loadTriggers();}} />}
      {templateForm!==null&&<TemplateFormModal initial={templateForm} schools={schools} onClose={()=>setTemplateForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/templates',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast('Template saved!','✅');setTemplateForm(null);loadTemplates();}} />}
    </>
  );
}

// ── Shared sub-components ──────────────────────────────────────────
function BreakdownCard({ title, data }: { title:string; data:[string,number][] }) {
  const max = data[0]?.[1]??1;
  return (
    <div className="breakdown-card">
      <div className="breakdown-title">{title}</div>
      {data.length===0?<div style={{color:'var(--m2)',fontSize:12}}>No data yet</div>
      :data.map(([label,count])=>(
        <div key={label} className="breakdown-item">
          <div className="breakdown-label" title={label}>{label}</div>
          <div className="breakdown-bar-wrap"><div className="breakdown-bar" style={{width:`${Math.round(count/max*100)}%`}}/></div>
          <div className="breakdown-count">{count}</div>
        </div>
      ))}
    </div>
  );
}

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
      <select value={status}  onChange={e=>setStatus(e.target.value)}>  <option value="">All Status</option>  {statuses.map(s=><option key={s}>{s}</option>)}</select>
      <select value={gateway} onChange={e=>setGateway(e.target.value)}><option value="">All Gateways</option>{gateways.map(g=><option key={g}>{g}</option>)}</select>
      <select value={city}    onChange={e=>setCity(e.target.value)}>    <option value="">All Cities</option>  {cities.map(c=><option key={c}>{c}</option>)}</select>
      <select value={cls}     onChange={e=>setCls(e.target.value)}>     <option value="">All Classes</option> {classes.map(c=><option key={c}>{c}</option>)}</select>
      <select value={gender}  onChange={e=>setGender(e.target.value)}>  <option value="">All Gender</option>  {['Male','Female','Other'].map(g=><option key={g}>{g}</option>)}</select>
      <span style={{fontSize:12,color:'var(--m)',marginLeft:'auto'}}>{filtered.length} of {rows.length}</span>
    </div>
    <div className="tbl-wrap"><table>
      <thead><tr>{['#','Date','Status','Student','Gender','Class','School','City','Parent','Phone','Gateway','Amount','Discount','Code'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={14} className="table-empty">No records found</td></tr>:filtered.map((r,i)=>{const sc=r.payment_status??'pending';return(<tr key={r.id} onClick={()=>onRowClick(r)}>
        <td style={{color:'var(--m2)',fontSize:11}}>{i+1}</td>
        <td style={{color:'var(--m)',fontSize:11}}>{r.created_at?.slice(0,10)}</td>
        <td><span className={`badge badge-${sc}`}>{r.payment_status??'pending'}</span></td>
        <td><div style={{fontWeight:700}}>{r.student_name}</div></td>
        <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:6,fontWeight:600,background:r.gender==='Male'?'#eff6ff':r.gender==='Female'?'#fdf2f8':'var(--bg)',color:r.gender==='Male'?'#2563eb':r.gender==='Female'?'#db2777':'var(--m)'}}>{r.gender??'—'}</span></td>
        <td><span style={{fontSize:11,background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontWeight:600}}>{r.class_grade??'—'}</span></td>
        <td className="wrap" style={{fontSize:12}}>{r.parent_school??'—'}</td>
        <td style={{fontSize:12}}>{r.city??'—'}</td>
        <td style={{fontSize:12}}>{r.parent_name??'—'}</td>
        <td><a href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()} style={{color:'var(--acc)',fontSize:12,textDecoration:'none',fontWeight:600}}>{r.contact_phone}</a></td>
        <td><span className="gw-tag">{r.gateway??'—'}</span></td>
        <td><span className="amt">₹{(r.final_amount??0)/100|0}</span></td>
        <td style={{fontSize:12,color:'var(--red)',fontWeight:600}}>{r.discount_amount?`-₹${(r.discount_amount??0)/100|0}`:'—'}</td>
        <td style={{fontSize:11,color:'var(--m)'}}>{r.discount_code?`🏷️ ${r.discount_code}`:'—'}</td>
      </tr>);})}</tbody>
    </table></div>
  </>);
}

function FollowUpList({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  if(!rows.length) return <div className="empty-state"><div className="emoji">🎉</div><p>No pending follow-ups!</p></div>;
  return <div className="followup-card">{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="followup-item" onClick={()=>onRowClick(r)}><div className={`fu-avatar ${st}`}>{(r.student_name??'?')[0].toUpperCase()}</div><div className="fu-info"><div className="fu-name">{r.student_name} <span className={`fu-tag ${st}`}>{r.payment_status}</span></div><div className="fu-meta">{r.class_grade} · {r.parent_school} · {r.city}</div></div><div className="fu-actions"><a className="fu-btn wa" href={`https://wa.me/91${r.contact_phone}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>💬 WA</a><a className="fu-btn call" href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()}>📞 Call</a></div><div style={{textAlign:'right',marginLeft:8}}><div className="amt" style={{fontSize:13}}>₹{(r.final_amount??0)/100|0}</div><div style={{fontSize:10,color:'var(--m2)'}}>{r.gateway}</div></div></div>);})}</div>;
}

function CityHeatmap({ rows }:{ rows:Row[] }) {
  const [metric,setMetric]=useState<'total'|'paid'|'revenue'>('total');
  const cd:Record<string,{total:number;paid:number;revenue:number}>={};
  rows.forEach(r=>{const c=r.city??'Unknown';if(!cd[c])cd[c]={total:0,paid:0,revenue:0};cd[c].total++;if(r.payment_status==='paid'){cd[c].paid++;cd[c].revenue+=r.final_amount??0;}});
  const sorted=Object.entries(cd).sort((a,b)=>b[1][metric]-a[1][metric]);
  const mx=sorted[0]?.[1][metric]??1;
  const colors=['#4f46e5','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'];
  return <><div style={{display:'flex',gap:8,marginBottom:20}}>{(['total','paid','revenue'] as const).map(m=><button key={m} className={`period-tab${metric===m?' active':''}`} onClick={()=>setMetric(m)} style={{border:'1.5px solid var(--bd)',borderRadius:8,padding:'6px 14px',background:metric===m?'var(--card)':'none',cursor:'pointer',fontSize:12,fontWeight:600,color:metric===m?'var(--acc)':'var(--m)'}}>{m.charAt(0).toUpperCase()+m.slice(1)}</button>)}</div>
  <div className="heatmap-grid">{sorted.map(([city,data])=>{const val=data[metric];const pct=val/mx;const ci=Math.min(Math.floor(pct*colors.length),colors.length-1);return(<div key={city} className="heatmap-cell" style={{background:colors[ci]+'22',border:`2px solid ${colors[ci]}66`}}><div className="heatmap-name">{city}</div><div className="heatmap-count" style={{color:colors[ci]}}>{metric==='revenue'?`₹${(val/100).toLocaleString('en-IN')}`:val}</div><div className="heatmap-rev">{data.paid} paid · {data.total} total</div></div>);})}</div></>;
}

function Timeline({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  const dc:Record<string,string>={paid:'paid',failed:'failed',initiated:'initiated',cancelled:'cancelled',pending:'initiated'};
  const de:Record<string,string>={paid:'✅',failed:'❌',initiated:'⏳',cancelled:'🚫',pending:'⏳'};
  return <div>{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="tl-item" onClick={()=>onRowClick(r)}><div className={`tl-dot ${dc[st]??'initiated'}`}>{de[st]??'⏳'}</div><div className="tl-info"><div className="tl-name">{r.student_name} <span style={{fontWeight:400,color:'var(--m)',fontSize:12}}>· {r.class_grade} · {r.parent_school}</span></div><div className="tl-meta">{r.gateway} · {r.city} · {r.contact_phone}</div></div><div style={{textAlign:'right'}}><div className="tl-amt">₹{(r.final_amount??0)/100|0}</div><div className="tl-time">{r.created_at?.slice(0,10)}</div></div></div>);})}</div>;
}

// ── Integrations page component ────────────────────────────────────
function IntegrationsPage({ integrations, schools, onEdit, onRefresh, showToast }:{ integrations:Row[]; schools:Row[]; onEdit:(r:Row)=>void; onRefresh:()=>void; showToast:(t:string,i:string)=>void }) {
  const [testingId, setTestingId] = useState<string|null>(null);
  const [testTo, setTestTo] = useState('');
  const providerGroups = { payment: ['razorpay','cashfree','easebuzz','paypal'], email: ['smtp','sendgrid','aws_ses'], whatsapp: ['whatsapp_cloud','twilio'] };
  const sectionLabel: Record<string,string> = { payment:'💳 Payment Gateways', email:'✉️ Email Providers', whatsapp:'💬 WhatsApp' };

  async function runTest(integration: Row) {
    if (!testTo) { showToast('Enter a test recipient first', '❌'); return; }
    const res = await fetch('/api/admin/integrations/test', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: integration.provider, config: integration.config, to: testTo }) });
    const data = await res.json();
    showToast(data.success ? data.message : data.error, data.success ? '✅' : '❌');
    setTestingId(null);
  }

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <input placeholder="Test recipient (email or phone)" value={testTo} onChange={e=>setTestTo(e.target.value)} style={{border:'1.5px solid var(--bd)',borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',color:'var(--text)',fontFamily:'DM Sans',minWidth:280}}/>
        <span style={{fontSize:12,color:'var(--m)'}}>Used by "Test" buttons below</span>
      </div>
      {Object.entries(providerGroups).map(([group, providers]) => {
        const items = integrations.filter(i => providers.includes(i.provider));
        return (
          <div key={group} style={{marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:10}}>{sectionLabel[group]}</div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Provider</th><th>School</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {items.length===0?<tr><td colSpan={5} className="table-empty" style={{padding:16,fontSize:12}}>No {group} integrations configured yet.</td></tr>
                  :items.map(i=>(
                    <tr key={i.id}>
                      <td><span className="gw-tag" style={{textTransform:'capitalize'}}>{i.provider.replace('_',' ')}</span></td>
                      <td style={{fontSize:12}}>{schools.find(s=>s.id===i.school_id)?.name??'Global'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{i.priority}</td>
                      <td><span className={`badge ${i.is_active?'badge-paid':'badge-cancelled'}`}>{i.is_active?'Active':'Off'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>onEdit(i)}>Edit</button>
                        {testingId===i.id
                          ? <button className="btn btn-primary" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>runTest(i)}>Send test →</button>
                          : <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--purple2)',color:'var(--purple)',border:'none'}} onClick={()=>setTestingId(i.id)}>Test</button>
                        }
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{await fetch('/api/admin/integrations',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:i.id})});onRefresh();}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }:{ title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay show" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{maxWidth:580}}>
        <div className="modal-head"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{padding:'20px 24px',maxHeight:'75vh',overflowY:'auto'}}>{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--m)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</label>{children}</div>;
}
const IS:React.CSSProperties = { width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' };
const SS:React.CSSProperties = { ...IS, appearance:'none' as any };

// ── Project form ───────────────────────────────────────────────────
function ProjectFormModal({ initial, onClose, onSave }:{ initial:Row; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', name:initial.name??'', slug:initial.slug??'', domain:initial.domain??'', status:initial.status??'active' });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Project':'New Project'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Project Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="e.g. Thynk 2025"/></Field>
        <Field label="Slug *"><input style={IS} value={f.slug} onChange={set('slug')} placeholder="thynk-2025" disabled={!!f.id}/></Field>
        <Field label="Domain (optional)"><input style={IS} value={f.domain} onChange={set('domain')} placeholder="thynk2025.com"/></Field>
        <Field label="Status"><select style={SS} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Project'}</button>
      </div>
    </ModalShell>
  );
}

// ── School form ────────────────────────────────────────────────────
function SchoolFormModal({ initial, schools, projects, onClose, onSave }:{ initial:Row; schools:Row[]; projects:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_code:initial.school_code??'', name:initial.name??'', org_name:initial.org_name??'Thynk Success', primary_color:initial.branding?.primaryColor??'#4f46e5', accent_color:initial.branding?.accentColor??'#8b5cf6', redirect_url:initial.branding?.redirectURL??'https://www.thynksuccess.com', program_name:initial.pricing?.[0]?.program_name??'', base_amount:initial.pricing?.[0]?.base_amount?String(initial.pricing[0].base_amount/100):'', currency:initial.pricing?.[0]?.currency??'INR', project_id:initial.project_id??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit School':'Add New School'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School Code *"><input style={IS} value={f.school_code} onChange={set('school_code')} placeholder="e.g. thynk" disabled={!!f.id}/></Field>
        <Field label="School / Program Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="ATGenius 2025"/></Field>
        <Field label="Organisation Name *"><input style={IS} value={f.org_name} onChange={set('org_name')} placeholder="Thynk Success"/></Field>
        <Field label="Project"><select style={SS} value={f.project_id} onChange={set('project_id')}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Redirect URL"><input style={IS} value={f.redirect_url} onChange={set('redirect_url')} placeholder="https://www.thynksuccess.com"/></Field>
        <Field label="Program Name *"><input style={IS} value={f.program_name} onChange={set('program_name')} placeholder="Thynk Coaching Program"/></Field>
        <Field label="Base Amount (₹) *"><input style={IS} type="number" value={f.base_amount} onChange={set('base_amount')} placeholder="1200"/></Field>
        <Field label="Currency"><select style={SS} value={f.currency} onChange={set('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></Field>
        <Field label="Primary Colour"><input style={{...IS,height:40}} type="color" value={f.primary_color} onChange={set('primary_color')}/></Field>
        <Field label="Accent Colour"><input style={{...IS,height:40}} type="color" value={f.accent_color} onChange={set('accent_color')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="is_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="is_active" style={{fontSize:13,fontWeight:600}}>School is Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create School'}</button>
      </div>
    </ModalShell>
  );
}

// ── Pricing form ───────────────────────────────────────────────────
function PricingFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', program_name:initial.program_name??'', base_amount:initial.base_amount?String(initial.base_amount/100):'', currency:initial.currency??'INR', gateway_sequence:(initial.gateway_sequence??['cf','rzp','eb']).join(','), valid_until:initial.valid_until?.slice(0,10)??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Pricing':'Add Pricing'} onClose={onClose}>
      <Field label="School *"><select style={SS} value={f.school_id} onChange={set('school_id')} disabled={!!f.id}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>)}</select></Field>
      <Field label="Program Name *"><input style={IS} value={f.program_name} onChange={set('program_name')} placeholder="Program name"/></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Base Amount *"><input style={IS} type="number" value={f.base_amount} onChange={set('base_amount')} placeholder="1200"/></Field>
        <Field label="Currency"><select style={SS} value={f.currency} onChange={set('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></Field>
        <Field label="Gateway Sequence (fallback order)"><input style={IS} value={f.gateway_sequence} onChange={set('gateway_sequence')} placeholder="cf,rzp,eb"/></Field>
        <Field label="Valid Until (optional)"><input style={IS} type="date" value={f.valid_until} onChange={set('valid_until')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="p_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="p_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({...f,gateway_sequence:f.gateway_sequence.split(',').map((s:string)=>s.trim())})}>{f.id?'Save Changes':'Create Pricing'}</button>
      </div>
    </ModalShell>
  );
}

// ── Discount form ──────────────────────────────────────────────────
function DiscountFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', code:initial.code??'', discount_type:initial.discount_type??'fixed', discount_amount:initial.discount_amount?String(initial.discount_amount/100):'', discount_value:initial.discount_value??'', max_uses:initial.max_uses??'', expires_at:initial.expires_at?.slice(0,10)??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Discount Code':'New Discount Code'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School *"><select style={SS} value={f.school_id} onChange={set('school_id')} disabled={!!f.id}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Code *"><input style={{...IS,textTransform:'uppercase'}} value={f.code} onChange={set('code')} placeholder="EARLY200" disabled={!!f.id}/></Field>
        <Field label="Discount Type"><select style={SS} value={f.discount_type} onChange={set('discount_type')}><option value="fixed">Fixed amount (₹)</option><option value="percent">Percentage (%)</option></select></Field>
        {f.discount_type==='fixed'
          ? <Field label="Discount Amount (₹) *"><input style={IS} type="number" value={f.discount_amount} onChange={set('discount_amount')} placeholder="200"/></Field>
          : <Field label="Discount % *"><input style={IS} type="number" min="1" max="100" value={f.discount_value} onChange={set('discount_value')} placeholder="10"/></Field>
        }
        <Field label="Max Uses (blank = unlimited)"><input style={IS} type="number" value={f.max_uses} onChange={set('max_uses')} placeholder="100"/></Field>
        <Field label="Expires At (optional)"><input style={IS} type="date" value={f.expires_at} onChange={set('expires_at')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="d_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="d_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Code'}</button>
      </div>
    </ModalShell>
  );
}

// ── User form ──────────────────────────────────────────────────────
function UserFormModal({ schools, onClose, onSave }:{ schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ email:'', password:'', role:'school_admin', school_id:'' });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.value}));
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

// ── Integration form ───────────────────────────────────────────────
function IntegrationFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', provider:initial.provider??'razorpay', config:initial.config??{}, priority:initial.priority??0, is_active:initial.is_active!==false });
  const [configStr,setConfigStr]=useState(JSON.stringify(initial.config??{},null,2));
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  const providerHints: Record<string,string> = { razorpay:'{"rzp_key_id":"rzp_live_xxx"}', cashfree:'{"cf_app_id":"xxx","cf_mode":"production"}', easebuzz:'{"eb_key":"xxx","eb_env":"production"}', paypal:'{"pp_client_id":"xxx","pp_mode":"live"}', smtp:'{"host":"smtp.gmail.com","port":587,"user":"you@gmail.com","from_email":"you@gmail.com"}', sendgrid:'{"from_email":"noreply@thynk.com","from_name":"Thynk Success"}', aws_ses:'{"region":"us-east-1","access_key_id":"AKIA...","from_email":"noreply@thynk.com"}', whatsapp_cloud:'{"phone_number_id":"xxx","waba_id":"xxx"}', twilio:'{"account_sid":"ACxxx","whatsapp_from":"14155238886"}' };
  return (
    <ModalShell title={f.id?'Edit Integration':'Add Integration'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School (blank = global)"><select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">Global / all schools</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Provider *"><select style={SS} value={f.provider} onChange={e=>{set('provider')(e);setConfigStr(JSON.stringify({},null,2));}}>{['razorpay','cashfree','easebuzz','paypal','smtp','sendgrid','aws_ses','whatsapp_cloud','twilio'].map(p=><option key={p} value={p}>{p.replace('_',' ')}</option>)}</select></Field>
        <Field label="Priority (lower = first)"><input style={IS} type="number" value={f.priority} onChange={set('priority')} placeholder="0"/></Field>
        <Field label="Active"><select style={SS} value={f.is_active?'true':'false'} onChange={e=>setF(p=>({...p,is_active:e.target.value==='true'}))}><option value="true">Yes</option><option value="false">No</option></select></Field>
      </div>
      <Field label={`Config JSON — hint: ${providerHints[f.provider]??'{}'}`}>
        <textarea style={{...IS,height:120,fontFamily:'monospace',fontSize:12,resize:'vertical'}} value={configStr} onChange={e=>setConfigStr(e.target.value)}/>
      </Field>
      <p style={{fontSize:11,color:'var(--m)',marginBottom:16}}>⚠️ Store only key IDs here. Put secrets in Supabase Vault or environment variables.</p>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{try{const config=JSON.parse(configStr);onSave({...f,config});}catch{alert('Invalid JSON in config field');}}}>Save Integration</button>
      </div>
    </ModalShell>
  );
}

// ── Trigger form ───────────────────────────────────────────────────
function TriggerFormModal({ initial, schools, templates, onClose, onSave }:{ initial:Row; schools:Row[]; templates:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', event_type:initial.event_type??'registration_created', channel:initial.channel??'email', template_id:initial.template_id??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  const filteredTemplates = templates.filter(t=>t.channel===f.channel);
  return (
    <ModalShell title={f.id?'Edit Trigger':'New Trigger'} onClose={onClose}>
      <Field label="School (blank = global)"><select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">All schools (global)</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Event *"><select style={SS} value={f.event_type} onChange={set('event_type')}><option value="registration_created">Registration created</option><option value="payment_success">Payment success</option><option value="payment_failed">Payment failed</option></select></Field>
        <Field label="Channel *"><select style={SS} value={f.channel} onChange={set('channel')}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
      </div>
      <Field label="Template *"><select style={SS} value={f.template_id} onChange={set('template_id')}><option value="">Select template</option>{filteredTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      {filteredTemplates.length===0&&<p style={{fontSize:12,color:'var(--orange)',marginBottom:12}}>No {f.channel} templates found. Create one in the Templates section first.</p>}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="trig_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="trig_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>Save Trigger</button>
      </div>
    </ModalShell>
  );
}

// ── Template form ──────────────────────────────────────────────────
const TEMPLATE_VARS = '{{student_name}} {{parent_name}} {{contact_phone}} {{contact_email}} {{class_grade}} {{parent_school}} {{city}} {{school_name}} {{program_name}} {{amount}} {{txn_id}} {{gateway}} {{paid_at}} {{retry_link}}';
function TemplateFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', channel:initial.channel??'email', name:initial.name??'', subject:initial.subject??'', body:initial.body??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Template':'New Template'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Template Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="Payment Success Email"/></Field>
        <Field label="Channel *"><select style={SS} value={f.channel} onChange={set('channel')}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
        <Field label="School (blank = global)"><select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">Global</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      {f.channel==='email'&&<Field label="Subject"><input style={IS} value={f.subject} onChange={set('subject')} placeholder="Payment confirmed — {{program_name}}"/></Field>}
      <Field label="Body *">
        <textarea style={{...IS,height:160,fontFamily:'monospace',fontSize:12,resize:'vertical'}} value={f.body} onChange={set('body')} placeholder="Hi {{parent_name}},\n\nYour registration for {{program_name}} has been confirmed.\n\nAmount paid: {{amount}}\nTransaction ID: {{txn_id}}"/>
      </Field>
      <p style={{fontSize:11,color:'var(--m)',marginBottom:14}}>Available variables: {TEMPLATE_VARS}</p>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="tmpl_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="tmpl_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>Save Template</button>
      </div>
    </ModalShell>
  );
}
