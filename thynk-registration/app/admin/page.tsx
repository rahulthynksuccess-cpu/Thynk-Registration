'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// ── Helpers ────────────────────────────────────────────────────────
const PALETTE = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#0891b2'];
function fmt(n: any) { const v = parseFloat(String(n??0).replace(/[^0-9.]/g,'')); return isNaN(v)?'0':v.toLocaleString('en-IN'); }
function fmtRupees(p: number) { return fmt(p/100); }
function esc(s: any) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

type Row = Record<string,any>;

// ── Sidebar nav items ──────────────────────────────────────────────
const NAV = [
  { section: 'Analytics' },
  { id:'overview',   icon:'🏠', label:'Overview' },
  { id:'students',   icon:'👨‍🎓', label:'Students' },
  { id:'trends',     icon:'📈', label:'Trends' },
  { id:'analytics',  icon:'🔬', label:'Analytics' },
  { section: 'Actions' },
  { id:'followup',   icon:'📞', label:'Follow-Up',   badge:true },
  { id:'heatmap',    icon:'🗺️',  label:'City Heatmap' },
  { id:'recent',     icon:'🕐', label:'Recent Activity' },
  { section: 'Management' },
  { id:'schools',    icon:'🏫', label:'Schools' },
  { id:'pricing',    icon:'💰', label:'Pricing' },
  { id:'discounts',  icon:'🏷️', label:'Discount Codes' },
  { id:'users',      icon:'👥', label:'Admin Users' },
  { section: 'Tools' },
  { id:'_export',    icon:'⬇️', label:'Export CSV', action:true },
  { id:'_refresh',   icon:'🔄', label:'Refresh',    action:true },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser]         = useState<any>(null);
  const [isSuperAdmin, setSuperAdmin] = useState(false);
  const [allRows, setAllRows]   = useState<Row[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activePage, setActivePage] = useState('overview');
  const [lastUpdated, setLastUpdated] = useState('Loading...');
  const [toast, setToast]       = useState({ text:'', type:'' });
  const [modal, setModal]       = useState<Row|null>(null);
  const [drillData, setDrillData] = useState<{title:string;rows:Row[]}|null>(null);
  const [trendDays, setTrendDays] = useState(7);
  // Management state
  const [schools, setSchools]   = useState<Row[]>([]);
  const [pricingList, setPricingList] = useState<Row[]>([]);
  const [discounts, setDiscounts] = useState<Row[]>([]);
  const [adminUsers, setAdminUsers] = useState<Row[]>([]);
  // Modal forms
  const [schoolForm, setSchoolForm] = useState<Row|null>(null);
  const [pricingForm, setPricingForm] = useState<Row|null>(null);
  const [discountForm, setDiscountForm] = useState<Row|null>(null);
  const [userForm, setUserForm] = useState<Row|null>(null);

  const chartsRef = useRef<Record<string,any>>({});
  const toastTimer = useRef<any>();

  // ── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/admin/login'); return; }
      setUser(data.user);
      // Check super admin
      const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', data.user.id).eq('role','super_admin').is('school_id',null).maybeSingle();
      setSuperAdmin(!!role);
    });
  }, [router]);

  // ── Data loaders ──────────────────────────────────────────────────
  const loadRegistrations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/registrations?limit=1000');
      const data = await res.json();
      const rows = (data.rows??[]).filter((r:Row) => r.student_name?.trim());
      setAllRows(rows);
      setLastUpdated(`Last updated ${new Date().toLocaleTimeString('en-IN')} · ${rows.length} records`);
      showToast(`Loaded ${rows.length} records`,'✅');
    } catch(e:any) { showToast('Load error: '+e.message,'❌'); }
    finally { setLoading(false); }
  }, []);

  const loadSchools = useCallback(async () => {
    const res = await fetch('/api/admin/schools');
    const data = await res.json();
    setSchools(data.schools??[]);
  }, []);

  const loadPricing = useCallback(async () => {
    const res = await fetch('/api/admin/pricing');
    const data = await res.json();
    setPricingList(data.pricing??[]);
  }, []);

  const loadDiscounts = useCallback(async () => {
    const res = await fetch('/api/admin/discounts');
    const data = await res.json();
    setDiscounts(data.discounts??[]);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    setAdminUsers(data.users??[]);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadRegistrations();
    const t = setInterval(loadRegistrations, 10*60*1000);
    return () => clearInterval(t);
  }, [user, loadRegistrations]);

  useEffect(() => {
    if (!user) return;
    if (activePage === 'schools')   loadSchools();
    if (activePage === 'pricing')   loadPricing();
    if (activePage === 'discounts') loadDiscounts();
    if (activePage === 'users')     loadUsers();
  }, [activePage, user]);

  function showToast(text:string, icon='') {
    setToast({ text:`${icon} ${text}`.trim(), type: icon==='✅'?'ok':icon==='❌'?'err':'' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast({text:'',type:''}), 3500);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/admin/login');
  }

  // ── Charts ─────────────────────────────────────────────────────────
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
    const labels:string[]=[], paidArr:number[]=[], totalArr:number[]=[];
    for(let i=trendDays-1;i>=0;i--){
      const d=new Date(now);d.setDate(d.getDate()-i);
      const ds=d.toISOString().slice(0,10);
      labels.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));
      const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);
      totalArr.push(day.length); paidArr.push(day.filter(r=>r.payment_status==='paid').length);
    }
    const ctxD=(document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if(ctxD) chartsRef.current.daily=new C(ctxD,{type:'bar',data:{labels,datasets:[
      {label:'Total',data:totalArr,backgroundColor:'rgba(79,70,229,.12)',borderColor:'#4f46e5',borderWidth:2,borderRadius:8,borderSkipped:false},
      {label:'Paid',data:paidArr,backgroundColor:'rgba(16,185,129,.8)',borderRadius:8,borderSkipped:false}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false}}}}});

    destroyChart('status');
    const sc:Record<string,number>={};
    allRows.forEach(r=>{const s=r.payment_status??'unknown';sc[s]=(sc[s]??0)+1;});
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
    const C=(window as any).Chart;
    const now=new Date();
    destroyChart('trend');
    const tl:string[]=[],tt:number[]=[],tp:number[]=[],tr:number[]=[];
    for(let i=29;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);tl.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=allRows.filter(r=>r.created_at?.slice(0,10)===ds);tt.push(day.length);tp.push(day.filter(r=>r.payment_status==='paid').length);tr.push(day.filter(r=>r.payment_status==='paid').reduce((s:number,r:Row)=>s+(r.final_amount??0),0));}
    const ctxT=(document.getElementById('chartTrend') as HTMLCanvasElement)?.getContext('2d');
    if(ctxT) chartsRef.current.trend=new C(ctxT,{data:{labels:tl,datasets:[{type:'bar',label:'Total',data:tt,backgroundColor:'rgba(79,70,229,.1)',borderColor:'#4f46e5',borderWidth:1.5,borderRadius:6,yAxisID:'y'},{type:'bar',label:'Paid',data:tp,backgroundColor:'rgba(16,185,129,.7)',borderRadius:6,yAxisID:'y'},{type:'line',label:'Revenue',data:tr,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,.08)',borderWidth:2.5,pointRadius:3,fill:true,tension:.4,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1},position:'left',grid:{color:'rgba(0,0,0,.04)'}},y2:{beginAtZero:true,position:'right',grid:{display:false},ticks:{callback:(v:number)=>'₹'+fmt(v/100)}},x:{grid:{display:false}}}}});

    destroyChart('hourly');
    const hours=new Array(24).fill(0);allRows.forEach(r=>{const h=parseInt((r.created_at??'').slice(11,13));if(!isNaN(h)&&h>=0&&h<24)hours[h]++;});
    const ctxH=(document.getElementById('chartHourly') as HTMLCanvasElement)?.getContext('2d');
    if(ctxH) chartsRef.current.hourly=new C(ctxH,{type:'bar',data:{labels:Array.from({length:24},(_,i)=>i+':00'),datasets:[{data:hours,backgroundColor:hours.map(v=>v>0?'rgba(139,92,246,.75)':'rgba(139,92,246,.1)'),borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false},ticks:{maxRotation:0,font:{size:10}}}}}});

    destroyChart('discount');
    const dc:Record<string,number>={};allRows.filter(r=>r.discount_code).forEach(r=>{dc[r.discount_code]=(dc[r.discount_code]??0)+1;});
    const ctxDC=(document.getElementById('chartDiscount') as HTMLCanvasElement)?.getContext('2d');
    if(ctxDC){if(Object.keys(dc).length){chartsRef.current.discount=new C(ctxDC,{type:'bar',data:{labels:Object.keys(dc),datasets:[{data:Object.values(dc),backgroundColor:'rgba(245,158,11,.75)',borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}}}});}else{ctxDC.font='13px DM Sans';ctxDC.fillStyle='#94a3b8';ctxDC.textAlign='center';ctxDC.fillText('No discounts used yet',ctxDC.canvas.width/2,ctxDC.canvas.height/2);}}
  }

  function renderAnalyticsCharts() {
    if (!(window as any).Chart) return;
    const C=(window as any).Chart;
    const paid=allRows.filter(r=>r.payment_status==='paid');

    destroyChart('gender');
    const gc:Record<string,number>={};allRows.forEach(r=>{const g=r.gender??'Unknown';gc[g]=(gc[g]??0)+1;});
    const ctxGe=(document.getElementById('chartGender') as HTMLCanvasElement)?.getContext('2d');
    if(ctxGe){const gl=Object.keys(gc);chartsRef.current.gender=new C(ctxGe,{type:'doughnut',data:{labels:gl,datasets:[{data:Object.values(gc),backgroundColor:['#4f46e5','#ec4899','#94a3b8'],borderWidth:3,borderColor:'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},cutout:'60%',onClick:(_:any,els:any[])=>{if(els.length)drillDown('Gender: '+gl[els[0].index],allRows.filter(r=>(r.gender??'Unknown')===gl[els[0].index]))}}});}

    destroyChart('city');
    const cc:Record<string,number>={};allRows.forEach(r=>{const c=r.city??'Unknown';cc[c]=(cc[c]??0)+1;});
    const sc2=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const ctxCi=(document.getElementById('chartCity') as HTMLCanvasElement)?.getContext('2d');
    if(ctxCi) chartsRef.current.city=new C(ctxCi,{type:'bar',data:{labels:sc2.map(e=>e[0]),datasets:[{data:sc2.map(e=>e[1]),backgroundColor:'rgba(79,70,229,.7)',borderRadius:6,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'rgba(0,0,0,.05)'}},y:{grid:{display:false}}},onClick:(_:any,els:any[])=>{if(els.length)drillDown('City: '+sc2[els[0].index][0],allRows.filter(r=>(r.city??'Unknown')===sc2[els[0].index][0]))}}});

    destroyChart('school');
    const sch:Record<string,number>={};paid.forEach(r=>{const s=r.parent_school??'Unknown';sch[s]=(sch[s]??0)+1;});
    const ss=Object.entries(sch).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const ctxSc=(document.getElementById('chartSchool') as HTMLCanvasElement)?.getContext('2d');
    if(ctxSc) chartsRef.current.school=new C(ctxSc,{type:'bar',data:{labels:ss.map(e=>e[0]),datasets:[{data:ss.map(e=>e[1]),backgroundColor:'rgba(16,185,129,.7)',borderRadius:6,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'rgba(0,0,0,.05)'}},y:{grid:{display:false}}},onClick:(_:any,els:any[])=>{if(els.length)drillDown('School: '+ss[els[0].index][0],paid.filter(r=>(r.parent_school??'Unknown')===ss[els[0].index][0]))}}});
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

  // ── Computed stats ─────────────────────────────────────────────────
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
        {/* ── Sidebar ──────────────────────────────────────────────── */}
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

        {/* ── Main content ─────────────────────────────────────────── */}
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
                {color:'blue',  icon:'📋',label:'Total',    val:allRows.length, sub:'All registrations'},
                {color:'green', icon:'✅',label:'Paid',     val:paid.length,    sub:'Confirmed'},
                {color:'orange',icon:'⏳',label:'Pending',  val:pending.length, sub:'Awaiting payment'},
                {color:'red',   icon:'❌',label:'Failed',   val:failed.length,  sub:'Cancelled/failed'},
                {color:'purple',icon:'🏷️',label:'Discounts',val:allRows.filter(r=>r.discount_code).length,sub:'Used codes'},
                {color:'cyan',  icon:'🏫',label:'Schools',  val:schoolsSet.size,sub:'Unique schools'},
                {color:'pink',  icon:'🌆',label:'Cities',   val:citiesSet.size, sub:'Unique cities'},
                {color:'blue',  icon:'📅',label:'This Week',val:thisWeek,       sub:'Last 7 days'},
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
            <TrendKPIs allRows={allRows} />
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📈 30-Day Trend</div></div></div><div className="chart-wrap tall"><canvas id="chartTrend"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">🕐 Hourly Activity</div></div></div><div className="chart-wrap"><canvas id="chartHourly"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">🏷️ Discount Code Usage</div></div></div><div className="chart-wrap"><canvas id="chartDiscount"/></div></div>
            </div>
          </div>

          {/* ── Analytics ────────────────────────────────────────── */}
          <div className={`page${activePage==='analytics'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Analytics <span>Insights</span></h1></div></div>
            <div className="charts-grid">
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">⚧ Gender Split</div></div></div><div className="chart-wrap"><canvas id="chartGender"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">🌆 Top Cities</div></div></div><div className="chart-wrap tall"><canvas id="chartCity"/></div></div>
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">🏫 School Distribution</div></div></div><div className="chart-wrap tall"><canvas id="chartSchool"/></div></div>
            </div>
            <InsightCards allRows={allRows} paid={paid} />
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

          {/* ── SCHOOLS MANAGEMENT ───────────────────────────────── */}
          <div className={`page${activePage==='schools'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Schools <span>Management</span></h1><p>{schools.length} schools configured</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setSchoolForm({})}>+ Add School</button>}</div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Org</th><th>Program</th><th>Price</th><th>Gateways</th><th>Status</th><th>Link</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
                <tbody>
                  {schools.length===0?<tr><td colSpan={9} className="table-empty">No schools yet. Click "Add School" to create one.</td></tr>
                  :schools.map(s=>(
                    <tr key={s.id} onClick={()=>isSuperAdmin&&setSchoolForm(s)} style={{cursor:isSuperAdmin?'pointer':'default'}}>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{s.school_code}</code></td>
                      <td style={{fontWeight:700}}>{s.name}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{s.org_name}</td>
                      <td style={{fontSize:12}}>{s.pricing?.[0]?.program_name??'—'}</td>
                      <td><span className="amt">₹{fmtRupees(s.pricing?.[0]?.base_amount??0)}</span></td>
                      <td style={{fontSize:11}}>{(s.pricing?.[0]?.gateway_sequence??[]).join(', ')}</td>
                      <td><span className={`badge ${s.is_active?'badge-paid':'badge-cancelled'}`}>{s.is_active?'Active':'Inactive'}</span></td>
                      <td><a href={`/${s.school_code}`} target="_blank" style={{color:'var(--acc)',fontSize:12,textDecoration:'none'}} onClick={e=>e.stopPropagation()}>🔗 Open</a></td>
                      {isSuperAdmin&&<td onClick={e=>e.stopPropagation()}><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setSchoolForm(s)}>Edit</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── PRICING MANAGEMENT ───────────────────────────────── */}
          <div className={`page${activePage==='pricing'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Pricing <span>Management</span></h1><p>Control program fees per school</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setPricingForm({})}>+ Add Pricing</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>School</th><th>Program</th><th>Base Amount</th><th>Currency</th><th>Gateways</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {pricingList.length===0?<tr><td colSpan={8} className="table-empty">No pricing configured yet.</td></tr>
                  :pricingList.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:700}}>{p.schools?.name??p.school_id}</td>
                      <td>{p.program_name}</td>
                      <td><span className="amt">{p.currency==='USD'?'$':'₹'}{fmtRupees(p.base_amount)}</span></td>
                      <td><span className="gw-tag">{p.currency}</span></td>
                      <td style={{fontSize:11}}>{(p.gateway_sequence??[]).join(', ')}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{p.valid_until?new Date(p.valid_until).toLocaleDateString('en-IN'):'No expiry'}</td>
                      <td><span className={`badge ${p.is_active?'badge-paid':'badge-cancelled'}`}>{p.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setPricingForm(p)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Deactivate this pricing?'))return;await fetch('/api/admin/pricing',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,is_active:false})});loadPricing();}}>Off</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── DISCOUNT CODES MANAGEMENT ────────────────────────── */}
          <div className={`page${activePage==='discounts'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Discount <span>Codes</span></h1><p>{discounts.filter(d=>d.is_active).length} active codes</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setDiscountForm({})}>+ New Code</button></div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>School</th><th>Code</th><th>Discount</th><th>Used / Max</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {discounts.length===0?<tr><td colSpan={7} className="table-empty">No discount codes yet.</td></tr>
                  :discounts.map(d=>(
                    <tr key={d.id}>
                      <td style={{fontSize:12}}>{d.schools?.name??d.school_id}</td>
                      <td><code style={{background:'var(--orange2)',color:'var(--orange)',padding:'2px 8px',borderRadius:6,fontSize:12,fontWeight:700}}>{d.code}</code></td>
                      <td><span style={{color:'var(--green)',fontWeight:700}}>₹{fmtRupees(d.discount_amount)}</span></td>
                      <td style={{fontSize:12}}>{d.used_count} / {d.max_uses??'∞'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{d.expires_at?new Date(d.expires_at).toLocaleDateString('en-IN'):'Never'}</td>
                      <td><span className={`badge ${d.is_active?'badge-paid':'badge-cancelled'}`}>{d.is_active?'Active':'Inactive'}</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setDiscountForm(d)}>Edit</button>
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Delete code ${d.code}?`))return;await fetch('/api/admin/discounts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.id})});loadDiscounts();}}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ADMIN USERS MANAGEMENT ───────────────────────────── */}
          <div className={`page${activePage==='users'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Admin <span>Users</span></h1><p>Manage who can access this dashboard</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setUserForm({})}>+ Add Admin</button>}</div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Email</th><th>Role</th><th>School Access</th><th>Added</th>{isSuperAdmin&&<th>Actions</th>}</tr></thead>
                <tbody>
                  {adminUsers.length===0?<tr><td colSpan={5} className="table-empty">No admin users configured yet.</td></tr>
                  :adminUsers.map(u=>(
                    <tr key={u.id}>
                      <td style={{fontWeight:700}}>{u.email}</td>
                      <td><span className={`badge ${u.role==='super_admin'?'badge-paid':'badge-initiated'}`}>{u.role==='super_admin'?'Super Admin':'School Admin'}</span></td>
                      <td style={{fontSize:12}}>{u.role==='super_admin'?'All Schools':u.schools?.name??u.school_id??'—'}</td>
                      <td style={{fontSize:12,color:'var(--m)'}}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                      {isSuperAdmin&&<td><button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Remove ${u.email}?`))return;await fetch('/api/admin/users',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({role_id:u.id})});loadUsers();}}>Remove</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>

      {/* ── Student detail modal ────────────────────────────────── */}
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

      {/* ── Drill-down modal ────────────────────────────────────── */}
      {drillData&&(
        <div className="drill-overlay show" onClick={e=>{if(e.target===e.currentTarget)setDrillData(null);}}>
          <div className="drill-modal">
            <div className="drill-head"><div><h3>{drillData.title}</h3><span className="drill-count">({drillData.rows.length} records)</span></div><button className="drill-close" onClick={()=>setDrillData(null)}>✕</button></div>
            <div className="drill-body">
              {drillData.rows.length===0?<div className="empty-state"><div className="emoji">📭</div><p>No records</p></div>
              :drillData.rows.map((r,i)=>(
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

      {/* ── School form modal ────────────────────────────────────── */}
      {schoolForm!==null&&<SchoolFormModal initial={schoolForm} schools={schools} onClose={()=>setSchoolForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/schools',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'School updated!':'School created!','✅');setSchoolForm(null);loadSchools();}} />}

      {/* ── Pricing form modal ───────────────────────────────────── */}
      {pricingForm!==null&&<PricingFormModal initial={pricingForm} schools={schools} onClose={()=>setPricingForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/pricing',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'Pricing updated!':'Pricing created!','✅');setPricingForm(null);loadPricing();}} />}

      {/* ── Discount form modal ──────────────────────────────────── */}
      {discountForm!==null&&<DiscountFormModal initial={discountForm} schools={schools} onClose={()=>setDiscountForm(null)} onSave={async(data)=>{const method=data.id?'PATCH':'POST';const res=await fetch('/api/admin/discounts',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast(data.id?'Code updated!':'Code created!','✅');setDiscountForm(null);loadDiscounts();}} />}

      {/* ── User form modal ─────────────────────────────────────── */}
      {userForm!==null&&<UserFormModal schools={schools} onClose={()=>setUserForm(null)} onSave={async(data)=>{const res=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const r=await res.json();if(!res.ok){showToast(r.error,'❌');return;}showToast('Admin user created!','✅');setUserForm(null);loadUsers();}} />}
    </>
  );
}

// ── Analytics sub-components ───────────────────────────────────────

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
        <td><span className="amt">₹{fmtRupees(r.final_amount??0)}</span></td>
        <td style={{fontSize:12,color:'var(--red)',fontWeight:600}}>{r.discount_amount?`-₹${fmtRupees(r.discount_amount)}`:'—'}</td>
        <td style={{fontSize:11,color:'var(--m)'}}>{r.discount_code?`🏷️ ${r.discount_code}`:'—'}</td>
      </tr>);})}</tbody>
    </table></div>
  </>);
}

function TrendKPIs({ allRows }:{ allRows:Row[] }) {
  const now=new Date();
  const wago=new Date(now.getTime()-7*24*60*60*1000),twago=new Date(now.getTime()-14*24*60*60*1000),mstart=new Date(now.getFullYear(),now.getMonth(),1),lmstart=new Date(now.getFullYear(),now.getMonth()-1,1);
  const tw=allRows.filter(r=>new Date(r.created_at)>=wago),lw=allRows.filter(r=>{const d=new Date(r.created_at);return d>=twago&&d<wago;}),tm=allRows.filter(r=>new Date(r.created_at)>=mstart),lm=allRows.filter(r=>{const d=new Date(r.created_at);return d>=lmstart&&d<mstart;});
  const twr=tw.filter(r=>r.payment_status==='paid').reduce((s:number,r:Row)=>s+(r.final_amount??0),0),lwr=lw.filter(r=>r.payment_status==='paid').reduce((s:number,r:Row)=>s+(r.final_amount??0),0);
  const wc=lw.length?Math.round((tw.length-lw.length)/lw.length*100):0,mc=lm.length?Math.round((tm.length-lm.length)/lm.length*100):0,rc=lwr?Math.round((twr-lwr)/lwr*100):0;
  return <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>{[{label:'This week',val:tw.length,ch:wc},{label:'This month',val:tm.length,ch:mc},{label:'Weekly revenue',val:`₹${fmtRupees(twr)}`,ch:rc}].map(k=><div key={k.label} style={{background:'var(--card)',borderRadius:14,padding:16,boxShadow:'var(--shadow)',border:'1px solid var(--bd)',textAlign:'center'}}><div style={{fontFamily:'Sora',fontSize:24,fontWeight:800}}>{k.val}</div><div style={{fontSize:12,color:'var(--m)',marginTop:4}}>{k.label}</div><div style={{fontSize:11,fontWeight:600,marginTop:4,color:k.ch>=0?'var(--green)':'var(--red)'}}>{k.ch>=0?'▲ +':'▼ '}{k.ch}% vs prev</div></div>)}</div>;
}

function InsightCards({ allRows, paid }:{ allRows:Row[]; paid:Row[] }) {
  const cr:Record<string,number>={};paid.forEach(r=>{cr[r.city??'Unknown']=(cr[r.city??'Unknown']??0)+(r.final_amount??0);});
  const tc=Object.entries(cr).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const sc:Record<string,number>={};paid.forEach(r=>{sc[r.parent_school??'Unknown']=(sc[r.parent_school??'Unknown']??0)+1;});
  const ts=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const total=allRows.length,p=paid.length,conv=total?Math.round(p/total*100):0;
  const m=['🥇','🥈','🥉','4️⃣','5️⃣'];
  return <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:20}}>
    <div className="chart-card"><div className="chart-title" style={{marginBottom:14}}>🏙️ Top Cities by Revenue</div>{tc.map(([c,r],i)=><div key={c} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<tc.length-1?'1px solid var(--bd)':'none'}}><span style={{fontSize:18}}>{m[i]}</span><span style={{flex:1,fontSize:13,fontWeight:600}}>{c}</span><span style={{fontFamily:'Sora',fontWeight:700,color:'var(--acc)'}}>₹{fmtRupees(r)}</span></div>)}</div>
    <div className="chart-card"><div className="chart-title" style={{marginBottom:14}}>🏫 Top Schools</div>{ts.map(([s,c],i)=><div key={s} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<ts.length-1?'1px solid var(--bd)':'none'}}><span style={{fontSize:18}}>{m[i]}</span><span style={{flex:1,fontSize:13,fontWeight:600}}>{s}</span><span style={{fontFamily:'Sora',fontWeight:700,color:'var(--m)'}}>{c} students</span></div>)}</div>
    <div className="chart-card"><div className="chart-title" style={{marginBottom:14}}>📊 Conversion Rate</div><div style={{background:'var(--green2)',borderRadius:12,padding:'16px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><span style={{fontSize:13,color:'var(--green)',fontWeight:700}}>Overall</span><span style={{fontFamily:'Sora',fontSize:32,fontWeight:800,color:'var(--green)'}}>{conv}%</span></div><div style={{display:'flex',gap:8}}>{[['Total',total,'var(--acc)'],['Paid',p,'var(--green)'],['Unpaid',total-p,'var(--red)']].map(([l,v,c])=><div key={String(l)} style={{flex:1,textAlign:'center',padding:12,background:'var(--bg)',borderRadius:10}}><div style={{fontFamily:'Sora',fontSize:22,fontWeight:800,color:String(c)}}>{v}</div><div style={{fontSize:11,color:'var(--m)'}}>{l}</div></div>)}</div></div>
  </div>;
}

function FollowUpList({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  if(!rows.length) return <div className="empty-state"><div className="emoji">🎉</div><p>No pending follow-ups!</p></div>;
  return <div className="followup-card">{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="followup-item" onClick={()=>onRowClick(r)}><div className={`fu-avatar ${st}`}>{(r.student_name??'?')[0].toUpperCase()}</div><div className="fu-info"><div className="fu-name">{r.student_name} <span className={`fu-tag ${st}`}>{r.payment_status}</span></div><div className="fu-meta">{r.class_grade} · {r.parent_school} · {r.city}</div></div><div className="fu-actions"><a className="fu-btn wa" href={`https://wa.me/91${r.contact_phone}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>💬 WA</a><a className="fu-btn call" href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()}>📞 Call</a></div><div style={{textAlign:'right',marginLeft:8}}><div className="amt" style={{fontSize:13}}>₹{fmtRupees(r.final_amount??0)}</div><div style={{fontSize:10,color:'var(--m2)'}}>{r.gateway}</div></div></div>);})}</div>;
}

function CityHeatmap({ rows }:{ rows:Row[] }) {
  const [metric,setMetric]=useState<'total'|'paid'|'revenue'>('total');
  const cd:Record<string,{total:number;paid:number;revenue:number}>={};
  rows.forEach(r=>{const c=r.city??'Unknown';if(!cd[c])cd[c]={total:0,paid:0,revenue:0};cd[c].total++;if(r.payment_status==='paid'){cd[c].paid++;cd[c].revenue+=r.final_amount??0;}});
  const sorted=Object.entries(cd).sort((a,b)=>b[1][metric]-a[1][metric]);
  const mx=sorted[0]?.[1][metric]??1;
  const colors=['#4f46e5','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'];
  return <>
    <div style={{display:'flex',gap:8,marginBottom:20}}>{(['total','paid','revenue'] as const).map(m=><button key={m} className={`period-tab${metric===m?' active':''}`} onClick={()=>setMetric(m)} style={{border:'1.5px solid var(--bd)',borderRadius:8,padding:'6px 14px',background:metric===m?'var(--card)':'none',cursor:'pointer',fontSize:12,fontWeight:600,color:metric===m?'var(--acc)':'var(--m)'}}>{m.charAt(0).toUpperCase()+m.slice(1)}</button>)}</div>
    <div className="heatmap-grid">{sorted.map(([city,data])=>{const val=data[metric];const pct=val/mx;const ci=Math.min(Math.floor(pct*colors.length),colors.length-1);return(<div key={city} className="heatmap-cell" style={{background:colors[ci]+'22',border:`2px solid ${colors[ci]}66`}}><div className="heatmap-name">{city}</div><div className="heatmap-count" style={{color:colors[ci]}}>{metric==='revenue'?`₹${fmtRupees(val)}`:val}</div><div className="heatmap-rev">{data.paid} paid · {data.total} total</div></div>);})}</div>
  </>;
}

function Timeline({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  const dc:Record<string,string>={paid:'paid',failed:'failed',initiated:'initiated',cancelled:'cancelled',pending:'initiated'};
  const de:Record<string,string>={paid:'✅',failed:'❌',initiated:'⏳',cancelled:'🚫',pending:'⏳'};
  return <div>{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="tl-item" onClick={()=>onRowClick(r)}><div className={`tl-dot ${dc[st]??'initiated'}`}>{de[st]??'⏳'}</div><div className="tl-info"><div className="tl-name">{r.student_name} <span style={{fontWeight:400,color:'var(--m)',fontSize:12}}>· {r.class_grade} · {r.parent_school}</span></div><div className="tl-meta">{r.gateway} · {r.city} · {r.contact_phone}</div></div><div style={{textAlign:'right'}}><div className="tl-amt">₹{fmtRupees(r.final_amount??0)}</div><div className="tl-time">{r.created_at?.slice(0,10)}</div></div></div>);})}</div>;
}

// ── Management form modals ─────────────────────────────────────────

function ModalShell({ title, onClose, children }:{ title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay show" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-head"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{padding:'20px 24px'}}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }:{ label:string; children:React.ReactNode }) {
  return <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--m)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.04em'}}>{label}</label>{children}</div>;
}

const inputStyle:React.CSSProperties = { width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' };
const selectStyle:React.CSSProperties = { ...inputStyle, appearance:'none' as any };

function SchoolFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_code:initial.school_code??'', name:initial.name??'', org_name:initial.org_name??'Thynk Success', primary_color:initial.branding?.primaryColor??'#4f46e5', accent_color:initial.branding?.accentColor??'#8b5cf6', redirect_url:initial.branding?.redirectURL??'https://www.thynksuccess.com', program_name:initial.pricing?.[0]?.program_name??'', base_amount:initial.pricing?.[0]?.base_amount?String(initial.pricing[0].base_amount/100):'', currency:initial.pricing?.[0]?.currency??'INR', rzp_key_id:initial.gateway_config?.rzp_key_id??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit School':'Add New School'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School Code *"><input style={inputStyle} value={f.school_code} onChange={set('school_code')} placeholder="e.g. thynk" disabled={!!f.id}/></Field>
        <Field label="School / Program Name *"><input style={inputStyle} value={f.name} onChange={set('name')} placeholder="ATGenius 2025"/></Field>
        <Field label="Organisation Name *"><input style={inputStyle} value={f.org_name} onChange={set('org_name')} placeholder="Thynk Success"/></Field>
        <Field label="Redirect URL"><input style={inputStyle} value={f.redirect_url} onChange={set('redirect_url')} placeholder="https://www.thynksuccess.com"/></Field>
        <Field label="Program Name *"><input style={inputStyle} value={f.program_name} onChange={set('program_name')} placeholder="Thynk Success Coaching Program"/></Field>
        <Field label="Base Amount (₹) *"><input style={inputStyle} type="number" value={f.base_amount} onChange={set('base_amount')} placeholder="1200"/></Field>
        <Field label="Currency"><select style={selectStyle} value={f.currency} onChange={set('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></Field>
        <Field label="Razorpay Key ID"><input style={inputStyle} value={f.rzp_key_id} onChange={set('rzp_key_id')} placeholder="rzp_live_xxx"/></Field>
        <Field label="Primary Colour"><input style={{...inputStyle,height:40}} type="color" value={f.primary_color} onChange={set('primary_color')}/></Field>
        <Field label="Accent Colour"><input style={{...inputStyle,height:40}} type="color" value={f.accent_color} onChange={set('accent_color')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <input type="checkbox" id="is_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/>
        <label htmlFor="is_active" style={{fontSize:13,fontWeight:600}}>School is Active (registration page visible)</label>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create School'}</button>
      </div>
    </ModalShell>
  );
}

function PricingFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', program_name:initial.program_name??'', base_amount:initial.base_amount?String(initial.base_amount/100):'', currency:initial.currency??'INR', gateway_sequence:(initial.gateway_sequence??['cf','rzp','eb']).join(','), valid_until:initial.valid_until?.slice(0,10)??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Pricing':'Add Pricing'} onClose={onClose}>
      <Field label="School *"><select style={selectStyle} value={f.school_id} onChange={set('school_id')} disabled={!!f.id}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>)}</select></Field>
      <Field label="Program Name *"><input style={inputStyle} value={f.program_name} onChange={set('program_name')} placeholder="Program name"/></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Base Amount *"><input style={inputStyle} type="number" value={f.base_amount} onChange={set('base_amount')} placeholder="1200"/></Field>
        <Field label="Currency"><select style={selectStyle} value={f.currency} onChange={set('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></Field>
        <Field label="Gateway Sequence"><input style={inputStyle} value={f.gateway_sequence} onChange={set('gateway_sequence')} placeholder="cf,rzp,eb"/></Field>
        <Field label="Valid Until (optional)"><input style={inputStyle} type="date" value={f.valid_until} onChange={set('valid_until')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="p_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="p_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({...f,gateway_sequence:f.gateway_sequence.split(',').map((s:string)=>s.trim())})}>{f.id?'Save Changes':'Create Pricing'}</button>
      </div>
    </ModalShell>
  );
}

function DiscountFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ id:initial.id??'', school_id:initial.school_id??'', code:initial.code??'', discount_amount:initial.discount_amount?String(initial.discount_amount/100):'', max_uses:initial.max_uses??'', expires_at:initial.expires_at?.slice(0,10)??'', is_active:initial.is_active!==false });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.type==='checkbox'?(e.target as HTMLInputElement).checked:e.target.value}));
  return (
    <ModalShell title={f.id?'Edit Discount Code':'New Discount Code'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School *"><select style={selectStyle} value={f.school_id} onChange={set('school_id')} disabled={!!f.id}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Code *"><input style={{...inputStyle,textTransform:'uppercase'}} value={f.code} onChange={set('code')} placeholder="EARLY200" disabled={!!f.id}/></Field>
        <Field label="Discount Amount (₹) *"><input style={inputStyle} type="number" value={f.discount_amount} onChange={set('discount_amount')} placeholder="200"/></Field>
        <Field label="Max Uses (blank = unlimited)"><input style={inputStyle} type="number" value={f.max_uses} onChange={set('max_uses')} placeholder="100"/></Field>
        <Field label="Expires At (optional)"><input style={inputStyle} type="date" value={f.expires_at} onChange={set('expires_at')}/></Field>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="d_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="d_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Code'}</button>
      </div>
    </ModalShell>
  );
}

function UserFormModal({ schools, onClose, onSave }:{ schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF]=useState({ email:'', password:'', role:'school_admin', school_id:'' });
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setF(p=>({...p,[k]:e.target.value}));
  return (
    <ModalShell title="Add Admin User" onClose={onClose}>
      <Field label="Email *"><input style={inputStyle} type="email" value={f.email} onChange={set('email')} placeholder="admin@example.com"/></Field>
      <Field label="Password *"><input style={inputStyle} type="password" value={f.password} onChange={set('password')} placeholder="Minimum 8 characters"/></Field>
      <Field label="Role *"><select style={selectStyle} value={f.role} onChange={set('role')}><option value="school_admin">School Admin (one school only)</option><option value="super_admin">Super Admin (all schools)</option></select></Field>
      {f.role==='school_admin'&&<Field label="Assign to School *"><select style={selectStyle} value={f.school_id} onChange={set('school_id')}><option value="">Select school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>)}</select></Field>}
      <p style={{fontSize:12,color:'var(--m)',marginBottom:16}}>The user will receive an email to set their password and can log in at <strong>/admin</strong>.</p>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>Create Admin User</button>
      </div>
    </ModalShell>
  );
}
