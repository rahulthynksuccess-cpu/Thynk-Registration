'use client';
import { authFetch } from '@/lib/supabase/client';
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
  { id:'reporting',     icon:'📊', label:'Reporting'      },
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
  { id:'_integrations', icon:'⚙️',  label:'Payment & Email', href:'/admin/integrations' },
  { id:'_triggers',     icon:'🔔', label:'Message Triggers', href:'/admin/message-triggers' },
  { section:'Settings' },
  { id:'_settings',     icon:'📍', label:'Settings & Locations', href:'/admin/settings' },
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
  const accessTokenRef                = useRef<string>('');
  const chartReadyRef                 = useRef(false); // FIX: track Chart.js load state

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

  const [overviewProgram, setOverviewProgram] = useState('');

  const chartsRef  = useRef<Record<string,any>>({});
  const toastTimer = useRef<any>();

  // ── FIX: Load Chart.js via JS (not <script async>) so we control timing ──
  useEffect(() => {
    if ((window as any).Chart) { chartReadyRef.current = true; return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.async = true;
    s.onload = () => { chartReadyRef.current = true; };
    document.head.appendChild(s);
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!sessionData.session) { router.push('/admin/login'); return; }
      accessTokenRef.current = sessionData.session.access_token;
      setUser(sessionData.session.user);
      const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', sessionData.session.user.id).eq('role','super_admin').is('school_id',null).maybeSingle();
      setSuperAdmin(!!role);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) accessTokenRef.current = session.access_token;
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // ── Auth headers helper ───────────────────────────────────────────
  const authHeaders = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(accessTokenRef.current ? { 'Authorization': `Bearer ${accessTokenRef.current}` } : {}),
  }), []);

  // ── API helper ──────────────────────────────────────────────────
  const api = useCallback((path: string, opts?: RequestInit) =>
    fetch(`${BACKEND}${path}`, {
      credentials: 'include',
      headers: { ...(accessTokenRef.current ? { 'Authorization': `Bearer ${accessTokenRef.current}` } : {}), ...(opts?.headers ?? {}) },
      ...opts,
    }).then(r => r.json()), []);

  // ── FIX: renderWhenReady — polls until Chart.js is loaded then calls fn ──
  const renderWhenReady = useCallback((fn: () => void, retries = 20) => {
    if ((window as any).Chart) { chartReadyRef.current = true; fn(); return; }
    if (retries > 0) setTimeout(() => renderWhenReady(fn, retries - 1), 300);
  }, []);

  const loadRegistrations = useCallback(async () => {
    try {
      const data = await api('/api/admin/registrations?limit=1000');
      console.log('[registrations] raw sample:', data.rows?.[0]); // remove after confirming
      const rows = (data.rows ?? []).filter((r: Row) => r.student_name?.trim());
      setAllRows(rows);
      setLastUpdated(`Last updated ${new Date().toLocaleTimeString('en-IN')} · ${rows.length} records`);
      showToast(`Loaded ${rows.length} records`, '✅');
    } catch(e: any) { showToast('Load error: ' + e.message, '❌'); }
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

  useEffect(() => {
    if (!user) return;
    loadRegistrations();
    const t = setInterval(loadRegistrations, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [user, loadRegistrations]);

  useEffect(() => {
    if (!user) return;
    if (activePage === 'overview')     loadPrograms();
    if (activePage === 'reporting')    loadPrograms();
    if (activePage === 'programs')     loadPrograms();
    if (activePage === 'schools')      loadSchools();
    if (activePage === 'discounts')    loadDiscounts();
    if (activePage === 'users')        loadUsers();
    if (activePage === 'integrations') loadIntegrations();
    if (activePage === 'triggers')   { loadTriggers(); loadTemplates(); loadSchools(); }
    if (activePage === 'templates')    loadTemplates();
    if (activePage === 'locations')    loadLocations();
  }, [activePage, user]);

  function showToast(text: string, icon = '') {
    setToast({ text: `${icon} ${text}`.trim(), type: icon==='✅'?'ok':icon==='❌'?'err':'' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ text:'', type:'' }), 3500);
  }

  async function doLogout() { await createClient().auth.signOut(); router.push('/admin/login'); }

  // ── FIX: Chart effects use renderWhenReady so Chart.js timing is never a problem ──
  useEffect(() => {
    if (!allRows.length) return;
    if (activePage === 'overview')  renderWhenReady(renderOverviewCharts);
    if (activePage === 'trends')    renderWhenReady(renderTrendCharts);
    if (activePage === 'analytics') renderWhenReady(renderAnalyticsCharts);
  }, [activePage, allRows, trendDays, overviewProgram]);

  function dc(id: string) {
    if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; }
  }

  function renderOverviewCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;
    const filtered = overviewProgram ? allRows.filter(r => r.program_name === overviewProgram) : allRows;
    const now = new Date();

    dc('daily');
    const labels: string[] = [], paidArr: number[] = [], totalArr: number[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }));
      const day = filtered.filter(r => r.created_at?.slice(0, 10) === ds);
      totalArr.push(day.length);
      paidArr.push(day.filter(r => r.payment_status === 'paid').length);
    }
    const ctxD = (document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if (ctxD) chartsRef.current.daily = new C(ctxD, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Total', data:totalArr, backgroundColor:'rgba(79,70,229,.12)', borderColor:'#4f46e5', borderWidth:2, borderRadius:8, borderSkipped:false },
          { label:'Paid',  data:paidArr,  backgroundColor:'rgba(16,185,129,.8)', borderRadius:8, borderSkipped:false },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } }, x:{ grid:{ display:false } } } },
    });

    dc('status');
    const sc: Record<string,number> = {};
    filtered.forEach(r => { const s = r.payment_status ?? 'unknown'; sc[s] = (sc[s] ?? 0) + 1; });
    const colorMap: Record<string,string> = { paid:'#10b981', initiated:'#4f46e5', pending:'#f59e0b', failed:'#ef4444', cancelled:'#94a3b8' };
    const ctxS = (document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if (ctxS) {
      const sl = Object.keys(sc);
      chartsRef.current.status = new C(ctxS, {
        type: 'doughnut',
        data: { labels:sl, datasets:[{ data:Object.values(sc), backgroundColor:sl.map(l => colorMap[l] ?? '#94a3b8'), borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'65%' },
      });
    }
  }

  function renderTrendCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;
    const now = new Date();
    dc('trend');
    const tl: string[] = [], tt: number[] = [], tp: number[] = [], tr: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      tl.push(d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }));
      const day = allRows.filter(r => r.created_at?.slice(0, 10) === ds);
      tt.push(day.length);
      tp.push(day.filter(r => r.payment_status === 'paid').length);
      tr.push(day.filter(r => r.payment_status === 'paid').reduce((s: number, r: Row) => s + (r.final_amount ?? 0), 0));
    }
    const ctxT = (document.getElementById('chartTrend') as HTMLCanvasElement)?.getContext('2d');
    if (ctxT) chartsRef.current.trend = new C(ctxT, {
      data: {
        labels: tl,
        datasets: [
          { type:'bar',  label:'Total',   data:tt, backgroundColor:'rgba(79,70,229,.1)',  borderColor:'#4f46e5', borderWidth:1.5, borderRadius:6, yAxisID:'y' },
          { type:'bar',  label:'Paid',    data:tp, backgroundColor:'rgba(16,185,129,.7)', borderRadius:6, yAxisID:'y' },
          { type:'line', label:'Revenue', data:tr, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,.08)', borderWidth:2.5, pointRadius:3, fill:true, tension:.4, yAxisID:'y2' },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top' } },
        scales:{
          y:  { beginAtZero:true, position:'left' },
          y2: { beginAtZero:true, position:'right', grid:{ display:false }, ticks:{ callback:(v: number) => '₹' + fmt(v / 100) } },
          x:  { grid:{ display:false } },
        },
      },
    });
  }

  function renderAnalyticsCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;

    dc('gender');
    const gc: Record<string,number> = {};
    allRows.forEach(r => { const g = r.gender ?? 'Unknown'; gc[g] = (gc[g] ?? 0) + 1; });
    const ctxGe = (document.getElementById('chartGender') as HTMLCanvasElement)?.getContext('2d');
    if (ctxGe) {
      const gl = Object.keys(gc);
      chartsRef.current.gender = new C(ctxGe, {
        type: 'doughnut',
        data: { labels:gl, datasets:[{ data:Object.values(gc), backgroundColor:['#4f46e5','#ec4899','#94a3b8'], borderWidth:3, borderColor:'#fff', hoverOffset:8 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, cutout:'60%' },
      });
    }

    dc('city');
    const cc: Record<string,number> = {};
    allRows.forEach(r => { const c = r.city ?? 'Unknown'; cc[c] = (cc[c] ?? 0) + 1; });
    const sc2 = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctxCi = (document.getElementById('chartCity') as HTMLCanvasElement)?.getContext('2d');
    if (ctxCi) chartsRef.current.city = new C(ctxCi, {
      type: 'bar',
      data: { labels:sc2.map(e => e[0]), datasets:[{ data:sc2.map(e => e[1]), backgroundColor:'rgba(79,70,229,.7)', borderRadius:6, borderSkipped:false }] },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ beginAtZero:true }, y:{ grid:{ display:false } } } },
    });
  }

  function exportCSV() {
    const h = ['Date','Student','Class','Gender','School','City','Parent','Phone','Email','Gateway','Status','Base','Discount Code','Discount Amt','Final','Txn ID','Program'];
    const rows = [h, ...allRows.map(r => [
      r.created_at?.slice(0, 10), r.student_name, r.class_grade, r.gender, r.school_name ?? r.parent_school,
      r.city, r.parent_name, r.contact_phone, r.contact_email, r.gateway, r.payment_status,
      (r.base_amount ?? 0) / 100, r.discount_code, (r.discount_amount ?? 0) / 100,
      (r.final_amount ?? 0) / 100, r.gateway_txn_id, r.program_name,
    ])];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' }));
    a.download = `Thynk_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast('CSV exported!', '✅');
  }

  function navAction(id: string, href?: string) {
    if (href) { window.location.href = href; return; }
    if (id === '_export')  { exportCSV(); return; }
    if (id === '_refresh') { loadRegistrations(); return; }
    setActivePage(id);
  }

  const ovRows  = overviewProgram ? allRows.filter(r => r.program_name === overviewProgram) : allRows;
  const paid    = ovRows.filter(r => r.payment_status === 'paid');
  const pending = ovRows.filter(r => ['pending','initiated'].includes(r.payment_status));
  const failed  = ovRows.filter(r => ['failed','cancelled'].includes(r.payment_status));
  const totalRev = paid.reduce((s, r) => s + (r.final_amount ?? 0), 0);
  const conv = ovRows.length ? Math.round(paid.length / ovRows.length * 100) : 0;
  const avg  = paid.length   ? Math.round(totalRev / paid.length)            : 0;
  const today    = new Date().toISOString().slice(0, 10);
  const thisWeek = ovRows.filter(r => new Date(r.created_at) >= new Date(Date.now() - 7*24*60*60*1000)).length;
  // FIX: follow-up count — includes all non-paid statuses including null (initiated but no payment row yet)
  const followUpCount = allRows.filter(r => !r.payment_status || ['pending','failed','cancelled','initiated'].includes(r.payment_status)).length;

  const saveForm = async (path: string, data: Row, onDone: () => void, successMsg: string) => {
    const method = data.id ? 'PATCH' : 'POST';
    const res = await fetch(`${BACKEND}${path}`, { credentials:'include', method, headers:authHeaders(), body:JSON.stringify(data) });
    const r   = await res.json();
    if (!res.ok) { showToast(r.error ?? 'Error', '❌'); return; }
    showToast(successMsg, '✅');
    onDone();
  };

  if (!user) return null;

  return (
    <>
      {/* FIX: no <script async> tag — Chart.js loaded via useEffect above */}
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
            {NAV.map((item, i) => {
              if ('section' in item) return <div key={i} className="sb-section">{item.section}</div>;
              const isActive = !item.action && !('href' in item) && activePage === item.id;
              return (
                <button key={item.id} className={`sb-item${isActive?' active':''}`} onClick={() => navAction(item.id!, (item as any).href)}>
                  <span className="icon">{item.icon}</span>{item.label}
                  {item.badge && followUpCount > 0 && <span className="sb-badge">{followUpCount}</span>}
                  {('href' in item) && <span style={{ fontSize:9, opacity:0.5, marginLeft:'auto' }}>↗</span>}
                </button>
              );
            })}
          </nav>
          <div className="sb-bottom">
            <div className="sb-user">
              <div className="sb-avatar">{user.email?.[0]?.toUpperCase() ?? 'A'}</div>
              <div>
                <div className="sb-user-name">{user.email?.split('@')[0]}</div>
                <div className="sb-user-role">{isSuperAdmin ? 'Super Admin' : 'School Admin'}</div>
              </div>
            </div>
            <button className="sb-item" onClick={doLogout} style={{ color:'#fca5a5' }}><span className="icon">🚪</span>Logout</button>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────── */}
        <main className="main-content">

          {/* Overview */}
          <div className={`page${activePage==='overview'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Overview <span>Dashboard</span></h1><p>{lastUpdated}</p></div>
              <div className="topbar-right">
                <select value={overviewProgram} onChange={e => setOverviewProgram(e.target.value)}
                  style={{ border:'1.5px solid var(--bd)', borderRadius:10, padding:'7px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', cursor:'pointer', minWidth:160 }}>
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <div className="badge-live"><div className="dot"/>Live Data</div>
                <button className="btn btn-outline" onClick={loadRegistrations}>🔄 Refresh</button>
                <button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button>
              </div>
            </div>
            <div className="revenue-hero">
              <div>
                <div className="rev-label">💰 Total Revenue Collected</div>
                <div className="rev-val">₹{fmtR(totalRev)}</div>
                <div className="rev-sub">From {paid.length} confirmed payments{overviewProgram ? ` · ${overviewProgram}` : ''}</div>
              </div>
              <div className="rev-stats">
                <div className="rev-stat"><div className="rev-stat-val">{conv}%</div><div className="rev-stat-lbl">Conversion</div></div>
                <div className="rev-stat"><div className="rev-stat-val">₹{fmtR(avg)}</div><div className="rev-stat-lbl">Avg ticket</div></div>
                <div className="rev-stat"><div className="rev-stat-val">{ovRows.filter(r => r.created_at?.slice(0,10) === today).length}</div><div className="rev-stat-lbl">Today</div></div>
              </div>
            </div>
            <div className="stats-grid">
              {[
                { color:'blue',   icon:'📋', label:'Total',     val:ovRows.length,  sub:'All registrations' },
                { color:'green',  icon:'✅', label:'Paid',      val:paid.length,    sub:'Confirmed' },
                { color:'orange', icon:'⏳', label:'Pending',   val:pending.length, sub:'Awaiting payment' },
                { color:'red',    icon:'❌', label:'Failed',    val:failed.length,  sub:'Cancelled/failed' },
                { color:'purple', icon:'🏷️', label:'Discounts', val:ovRows.filter(r => r.discount_code).length, sub:'Used codes' },
                { color:'blue',   icon:'📅', label:'This Week', val:thisWeek,       sub:'Last 7 days' },
              ].map(c => (
                <div key={c.label} className={`stat-card ${c.color}`}>
                  <div className="stat-icon">{c.icon}</div>
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-val">{c.val}</div>
                  <div className="stat-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
              <span style={{ fontSize:13, color:'var(--m)', fontWeight:600 }}>Show:</span>
              <div className="period-tabs">
                {[7,14,30].map(d => <button key={d} className={`period-tab${trendDays===d?' active':''}`} onClick={() => setTrendDays(d)}>{d}d</button>)}
              </div>
            </div>
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📅 Daily Registrations</div></div></div><div className="chart-wrap"><canvas id="chartDaily"/></div></div>
              <div className="chart-card"><div className="chart-header"><div><div className="chart-title">📊 Payment Status</div></div></div><div className="chart-wrap"><canvas id="chartStatus"/></div></div>
            </div>
          </div>

          {/* Reporting */}
          <div className={`page${activePage==='reporting'?' active':''}`}>
            <ReportingPage allRows={allRows} programs={programs} />
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
            <FollowUpList rows={allRows.filter(r => !r.payment_status || ['pending','failed','cancelled','initiated'].includes(r.payment_status))} onRowClick={setModal} />
          </div>

          {/* Heatmap */}
          <div className={`page${activePage==='heatmap'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>City <span>Heatmap</span></h1></div></div>
            <CityHeatmap rows={allRows} />
          </div>

          {/* Recent */}
          <div className={`page${activePage==='recent'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Recent <span>Activity</span></h1></div></div>
            <Timeline rows={allRows.slice(0, 50)} onRowClick={setModal} />
          </div>

          {/* ── PROGRAMS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='programs'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Programs <span>Management</span></h1><p>Define base programs with URLs and pricing</p></div>
              <div className="topbar-right">{isSuperAdmin && <button className="btn btn-primary" onClick={() => setProgramForm({})}>+ Add Program</button>}</div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Program Name</th><th>Slug</th><th>Base Price INR (₹)</th><th>Base Price USD ($)</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {programs.length === 0
                  ? <tr><td colSpan={6} className="table-empty">No programs yet. Create a program first, then assign schools to it.</td></tr>
                  : programs.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight:700 }}>{p.name}</td>
                      <td><code style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12 }}>{p.slug}</code></td>
                      <td><span className="amt">₹{fmtR(p.base_amount_inr ?? p.base_amount ?? 0)}</span></td>
                      <td><span className="amt" style={{ color:'#22c55e' }}>{p.base_amount_usd ? `$${fmtR(p.base_amount_usd)}` : <span style={{ color:'var(--m)', fontWeight:400 }}>—</span>}</span></td>
                      <td><span className={`badge ${p.status==='active'?'badge-paid':'badge-cancelled'}`}>{p.status}</span></td>
                      <td><button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setProgramForm(p)}>Edit</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── SCHOOLS ──────────────────────────────────────────── */}
          <div className={`page${activePage==='schools'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Schools <span>Management</span></h1><p>{schools.length} schools configured</p></div>
              <div className="topbar-right">{isSuperAdmin && <button className="btn btn-primary" onClick={() => { loadPrograms(); setSchoolForm({}); }}>+ Add School</button>}</div>
            </div>
            <SchoolsTable schools={schools} programs={programs} isSuperAdmin={isSuperAdmin} onEdit={s => { loadPrograms(); setSchoolForm(s); }} />
          </div>

          {/* ── DISCOUNT CODES ───────────────────────────────────── */}
          <div className={`page${activePage==='discounts'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Discount <span>Codes</span></h1><p>{discounts.filter(d => d.is_active).length} active codes</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={() => setDiscountForm({})}>+ New Code</button></div>
            </div>
            <p style={{ fontSize:12, color:'var(--m)', marginBottom:16, padding:'0 4px' }}>💡 By default each school's code is its discount code. You can create additional codes below.</p>
            <div className="tbl-wrap"><table>
              <thead><tr><th>School</th><th>Code</th><th>Discount (₹)</th><th>Used / Max</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {discounts.length === 0
                  ? <tr><td colSpan={7} className="table-empty">No discount codes yet.</td></tr>
                  : discounts.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontSize:12 }}>{d.schools?.name ?? d.school_id}</td>
                      <td><code style={{ background:'var(--orange2)', color:'var(--orange)', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{d.code}</code></td>
                      <td><span style={{ color:'var(--green)', fontWeight:700 }}>₹{fmtR(d.discount_amount)}</span></td>
                      <td style={{ fontSize:12 }}>{d.used_count} / {d.max_uses ?? '∞'}</td>
                      <td style={{ fontSize:12, color:'var(--m)' }}>{d.expires_at ? new Date(d.expires_at).toLocaleDateString('en-IN') : 'Never'}</td>
                      <td><span className={`badge ${d.is_active?'badge-paid':'badge-cancelled'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setDiscountForm(d)}>Edit</button>
                        <button className="btn" style={{ fontSize:11, padding:'4px 10px', background:'var(--red2)', color:'var(--red)', border:'none' }} onClick={async () => { if (!confirm(`Delete code ${d.code}?`)) return; await fetch(`${BACKEND}/api/admin/discounts`, { credentials:'include', method:'DELETE', headers: authHeaders(), body:JSON.stringify({ id:d.id }) }); loadDiscounts(); }}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── ADMIN USERS ──────────────────────────────────────── */}
          <div className={`page${activePage==='users'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Admin <span>Users</span></h1></div>
              <div className="topbar-right">{isSuperAdmin && <button className="btn btn-primary" onClick={() => setUserForm({})}>+ Add Admin</button>}</div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Email</th><th>Role</th><th>School Access</th><th>Added</th>{isSuperAdmin && <th>Actions</th>}</tr></thead>
              <tbody>
                {adminUsers.length === 0
                  ? <tr><td colSpan={5} className="table-empty">No admin users yet.</td></tr>
                  : adminUsers.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight:700 }}>{u.email}</td>
                      <td><span className={`badge ${u.role==='super_admin'?'badge-paid':'badge-initiated'}`}>{u.role === 'super_admin' ? 'Super Admin' : 'School Admin'}</span></td>
                      <td style={{ fontSize:12 }}>{u.role === 'super_admin' ? 'All Schools' : u.schools?.name ?? '—'}</td>
                      <td style={{ fontSize:12, color:'var(--m)' }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                      {isSuperAdmin && <td><button className="btn" style={{ fontSize:11, padding:'4px 10px', background:'var(--red2)', color:'var(--red)', border:'none' }} onClick={async () => { if (!confirm(`Remove ${u.email}?`)) return; await fetch(`${BACKEND}/api/admin/users`, { credentials:'include', method:'DELETE', headers:authHeaders(), body:JSON.stringify({ role_id:u.id }) }); loadUsers(); }}>Remove</button></td>}
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── INTEGRATIONS ─────────────────────────────────────── */}
          <div className={`page${activePage==='integrations'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Integrations <span>Setup</span></h1><p>Payment gateways, email & WhatsApp providers</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={() => setIntegrationForm({})}>+ Add Integration</button></div>
            </div>
            <SectionTitle>💳 Payment Gateways</SectionTitle>
            <div className="int-grid">
              {['razorpay','cashfree','easebuzz','paypal'].map(provider => {
                const cfg = integrations.find(i => i.provider === provider);
                return <IntCard key={provider} provider={provider} cfg={cfg} onEdit={() => setIntegrationForm(cfg ?? { provider })} onToggle={async () => { if (!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`, { credentials:'include', method:'PATCH', headers:authHeaders(), body:JSON.stringify({ id:cfg.id, is_active:!cfg.is_active }) }); loadIntegrations(); }} />;
              })}
            </div>
            <SectionTitle>✉️ Email Providers</SectionTitle>
            <div className="int-grid">
              {['smtp','sendgrid','aws_ses'].map(provider => {
                const cfg = integrations.find(i => i.provider === provider);
                return <IntCard key={provider} provider={provider} cfg={cfg} onEdit={() => setIntegrationForm(cfg ?? { provider })} onToggle={async () => { if (!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`, { credentials:'include', method:'PATCH', headers:authHeaders(), body:JSON.stringify({ id:cfg.id, is_active:!cfg.is_active }) }); loadIntegrations(); }} />;
              })}
            </div>
            <SectionTitle>💬 WhatsApp Providers</SectionTitle>
            <div className="int-grid">
              {['whatsapp_cloud','twilio'].map(provider => {
                const cfg = integrations.find(i => i.provider === provider);
                return <IntCard key={provider} provider={provider} cfg={cfg} onEdit={() => setIntegrationForm(cfg ?? { provider })} onToggle={async () => { if (!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`, { credentials:'include', method:'PATCH', headers:authHeaders(), body:JSON.stringify({ id:cfg.id, is_active:!cfg.is_active }) }); loadIntegrations(); }} />;
              })}
            </div>
          </div>

          {/* ── TRIGGERS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='triggers'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Triggers <span>Automation</span></h1><p>Auto-send messages when events happen</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={() => setTriggerForm({})}>+ Add Trigger</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Event</th><th>Channel</th><th>Template</th><th>School</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {triggers.length === 0
                  ? <tr><td colSpan={6} className="table-empty">No triggers yet.</td></tr>
                  : triggers.map(t => (
                    <tr key={t.id}>
                      <td><code style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12 }}>{t.event_type}</code></td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{ fontSize:12 }}>{t.notification_templates?.name ?? '—'}</td>
                      <td style={{ fontSize:12, color:'var(--m)' }}>{t.school_id ?? 'All Schools'}</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setTriggerForm(t)}>Edit</button>
                        <button className="btn" style={{ fontSize:11, padding:'4px 10px', background:'var(--red2)', color:'var(--red)', border:'none' }} onClick={async () => { if (!confirm('Delete trigger?')) return; await fetch(`${BACKEND}/api/admin/triggers`, { credentials:'include', method:'DELETE', headers:authHeaders(), body:JSON.stringify({ id:t.id }) }); loadTriggers(); }}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── TEMPLATES ────────────────────────────────────────── */}
          <div className={`page${activePage==='templates'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Message <span>Templates</span></h1><p>Email & WhatsApp message drafts</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={() => setTemplateForm({})}>+ New Template</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Name</th><th>Channel</th><th>Subject</th><th>Preview</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {templates.length === 0
                  ? <tr><td colSpan={6} className="table-empty">No templates yet.</td></tr>
                  : templates.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight:700 }}>{t.name}</td>
                      <td><span className="gw-tag">{t.channel}</span></td>
                      <td style={{ fontSize:12 }}>{t.subject ?? '—'}</td>
                      <td style={{ fontSize:11, color:'var(--m)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.body?.slice(0, 80)}…</td>
                      <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setTemplateForm(t)}>Edit</button>
                        <button className="btn" style={{ fontSize:11, padding:'4px 10px', background:'var(--red2)', color:'var(--red)', border:'none' }} onClick={async () => { if (!confirm('Delete template?')) return; await fetch(`${BACKEND}/api/admin/templates`, { credentials:'include', method:'DELETE', headers:authHeaders(), body:JSON.stringify({ id:t.id }) }); loadTemplates(); }}>Delete</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── LOCATION MASTER ──────────────────────────────────── */}
          <div className={`page${activePage==='locations'?' active':''}`}>
            <LocationMasterPage rows={locations} BACKEND={BACKEND} onReload={loadLocations} showToast={showToast} />
          </div>

        </main>
      </div>

      {/* Student detail modal */}
      {modal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-head"><h3>{modal.student_name}</h3><button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body">
              {[
                ['Status', <span key="s" className={`badge badge-${modal.payment_status ?? 'pending'}`}>{modal.payment_status ?? '—'}</span>],
                ['Date', modal.created_at?.slice(0,10) ?? '—'],
                ['Student', modal.student_name],
                ['Class', modal.class_grade],
                ['Gender', modal.gender],
                ['School', modal.school_name ?? modal.parent_school],
                ['City', modal.city],
                ['Parent', modal.parent_name],
                ['Phone', <a key="p" href={`tel:${modal.contact_phone}`} style={{ color:'var(--acc)', fontWeight:600 }}>{modal.contact_phone}</a>],
                ['Email', <a key="e" href={`mailto:${modal.contact_email}`} style={{ color:'var(--acc)', fontSize:12 }}>{modal.contact_email}</a>],
                ['Gateway', modal.gateway ?? '—'],
                ['Base', `₹${fmtR(modal.base_amount ?? 0)}`],
                ['Discount', modal.discount_code ? `🏷️ ${modal.discount_code} (₹${fmtR(modal.discount_amount ?? 0)} off)` : 'None'],
                ['Paid', <span key="a" style={{ fontFamily:'Sora', fontWeight:800, color:'var(--green)', fontSize:18 }}>₹{fmtR(modal.final_amount ?? 0)}</span>],
                ['Txn ID', <span key="t" style={{ fontSize:11, color:'var(--m2)', wordBreak:'break-all' }}>{modal.gateway_txn_id ?? '—'}</span>],
              ].map(([l, v]) => <div key={String(l)} className="modal-row"><div className="modal-lbl">{l}</div><div className="modal-val">{v}</div></div>)}
            </div>
            <div className="modal-actions">
              <a className="fu-btn wa"   href={`https://wa.me/91${modal.contact_phone}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
              <a className="fu-btn call" href={`tel:${modal.contact_phone}`}>📞 Call</a>
              <a className="fu-btn" style={{ background:'var(--orange2)', color:'var(--orange)' }} href={`mailto:${modal.contact_email}`}>✉️ Email</a>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down modal */}
      {drillData && (
        <div className="drill-overlay show" onClick={e => { if (e.target === e.currentTarget) setDrillData(null); }}>
          <div className="drill-modal">
            <div className="drill-head"><div><h3>{drillData.title}</h3><span className="drill-count">({drillData.rows.length})</span></div><button className="drill-close" onClick={() => setDrillData(null)}>✕</button></div>
            <div className="drill-body">
              {drillData.rows.map((r, i) => (
                <div key={r.id} className="drill-row" onClick={() => { setDrillData(null); setTimeout(() => setModal(r), 200); }}>
                  <div className="drill-num">{i + 1}</div>
                  <div style={{ flex:1 }}><div className="drill-name">{r.student_name} <span className={`badge badge-${r.payment_status}`} style={{ fontSize:10 }}>{r.payment_status}</span></div><div className="drill-meta">{r.class_grade} · {r.school_name ?? r.parent_school} · {r.city}</div></div>
                  <div style={{ textAlign:'right' }}><div className="drill-amt">₹{fmtR(r.final_amount ?? 0)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {programForm  !== null && <ProgramFormModal  initial={programForm}  onClose={() => setProgramForm(null)}  onSave={async d => { await saveForm('/api/admin/projects',  d, () => { setProgramForm(null);  loadPrograms();  }, d.id ? 'Program updated!' : 'Program created!'); }} />}
      {schoolForm   !== null && <SchoolFormModal   initial={schoolForm}   programs={programs} onClose={() => setSchoolForm(null)}   onSave={async d => { await saveForm('/api/admin/schools',   d, () => { setSchoolForm(null);   setSchools([]); loadSchools(); }, d.id ? 'School updated!' : 'School created!'); }} />}
      {discountForm !== null && <DiscountFormModal initial={discountForm} schools={schools}   onClose={() => setDiscountForm(null)} onSave={async d => { await saveForm('/api/admin/discounts', d, () => { setDiscountForm(null); loadDiscounts(); }, d.id ? 'Code updated!' : 'Code created!'); }} />}
      {userForm     !== null && <UserFormModal     schools={schools}      onClose={() => setUserForm(null)}     onSave={async d => { await saveForm('/api/admin/users',     d, () => { setUserForm(null);     loadUsers();     }, 'Admin user created!'); }} />}
      {integrationForm !== null && <IntegrationFormModal initial={integrationForm} schools={schools} onClose={() => setIntegrationForm(null)} onSave={async d => { await saveForm('/api/admin/integrations', d, () => { setIntegrationForm(null); loadIntegrations(); }, d.id ? 'Integration updated!' : 'Integration saved!'); }} />}
      {triggerForm  !== null && <TriggerFormModal  initial={triggerForm}  schools={schools} templates={templates} onClose={() => setTriggerForm(null)}  onSave={async d => { await saveForm('/api/admin/triggers',  d, () => { setTriggerForm(null);  loadTriggers();  }, d.id ? 'Trigger updated!' : 'Trigger created!'); }} />}
      {templateForm !== null && <TemplateFormModal initial={templateForm} onClose={() => setTemplateForm(null)} onSave={async d => { await saveForm('/api/admin/templates', d, () => { setTemplateForm(null); loadTemplates(); }, d.id ? 'Template updated!' : 'Template created!'); }} />}
    </>
  );
}

// ── Reporting Page ─────────────────────────────────────────────────
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

function ReportingPage({ allRows, programs }: { allRows: Row[]; programs: Row[] }) {
  // FIX: default to 30 days so data shows immediately instead of current-year filter
  const [timelineDays,  setTimelineDays]  = useState(30);
  const [filterProgram, setFilterProgram] = useState('');

  const base = filterProgram ? allRows.filter(r => r.program_name === filterProgram) : allRows;
  const rows = filterByTimeline(base, timelineDays);
  const paid = rows.filter(r => r.payment_status === 'paid');
  const fmtAmt = (p: number) => { const v = p/100; return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };

  const countrySet  = [...new Set(rows.map(r => r.country ?? 'India').filter(Boolean))];
  const classSet    = [...new Set(rows.map(r => r.class_grade).filter(Boolean))].sort();
  const schoolSet   = [...new Set(rows.map(r => r.school_name).filter(Boolean))];
  const gatewaySet  = [...new Set(rows.map(r => r.gateway).filter(Boolean))];

  const schoolStats = schoolSet.map(s => {
    const sr = rows.filter(r => r.school_name === s);
    const p  = sr.filter(r => r.payment_status === 'paid');
    return { name: s, total: sr.length, paid: p.length, rev: p.reduce((a,r) => a + (r.final_amount ?? 0), 0) };
  }).sort((a,b) => b.total - a.total);

  const countryStats = countrySet.map(c => {
    const cr = rows.filter(r => (r.country ?? 'India') === c);
    const p  = cr.filter(r => r.payment_status === 'paid');
    const sc = [...new Set(cr.map(r => r.school_name).filter(Boolean))];
    return { country: c, schools: sc.length, total: cr.length, paid: p.length, rev: p.reduce((a,r) => a + (r.final_amount ?? 0), 0) };
  }).sort((a,b) => b.total - a.total);

  const classStats = classSet.map(c => {
    const cr = rows.filter(r => r.class_grade === c);
    const p  = cr.filter(r => r.payment_status === 'paid');
    const byGender: Record<string,number> = {};
    ['Male','Female','Other'].forEach(g => { byGender[g] = cr.filter(r => r.gender === g).length; });
    return { cls: c, total: cr.length, paid: p.length, byGender };
  });

  const genderStats = ['Male','Female','Other'].map(g => ({
    gender: g,
    total:  rows.filter(r => r.gender === g).length,
    paid:   rows.filter(r => r.gender === g && r.payment_status === 'paid').length,
  })).filter(g => g.total > 0);
  const unknownGender = rows.filter(r => !['Male','Female','Other'].includes(r.gender)).length;

  const gatewayStats = gatewaySet.map(g => {
    const gr = rows.filter(r => r.gateway === g);
    const p  = gr.filter(r => r.payment_status === 'paid');
    return { gw: g, total: gr.length, paid: p.length, rev: p.reduce((a,r) => a + (r.final_amount ?? 0), 0) };
  }).sort((a,b) => b.total - a.total);

  const inrPaid = paid.filter(r => (r.currency ?? 'INR') === 'INR');
  const usdPaid = paid.filter(r => r.currency === 'USD');
  const inrRev  = inrPaid.reduce((a,r) => a + (r.final_amount ?? 0), 0);
  const usdRev  = usdPaid.reduce((a,r) => a + (r.final_amount ?? 0), 0);

  const topCountries = countryStats.slice(0,5).map(c => c.country);
  const classCountry = classSet.map(cls => {
    const entry: Record<string,any> = { cls };
    topCountries.forEach(c => { entry[c] = rows.filter(r => r.class_grade === cls && (r.country ?? 'India') === c).length; });
    entry.total = rows.filter(r => r.class_grade === cls).length;
    return entry;
  });

  const maxOf = (arr: number[]) => Math.max(...arr, 1);

  const MiniBar = ({ val, max, color='var(--acc)' }: { val:number; max:number; color?:string }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, background:'rgba(255,255,255,0.06)', borderRadius:3, height:6, overflow:'hidden', minWidth:60 }}>
        <div style={{ width:`${Math.max(2, Math.round(val/max*100))}%`, height:'100%', background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', minWidth:24, textAlign:'right' }}>{val}</span>
    </div>
  );

  const KPI = ({ icon, label, val, sub, color='var(--acc)' }: { icon:string; label:string; val:any; sub?:string; color?:string }) => (
    <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'18px 20px', flex:1, minWidth:140 }}>
      <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, fontFamily:'Sora', color }}>{val}</div>
      {sub && <div style={{ fontSize:11, color:'var(--m)', marginTop:3 }}>{sub}</div>}
    </div>
  );

  const Section = ({ title, children }: { title:string; children:React.ReactNode }) => (
    <div style={{ marginBottom:32 }}>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:3, height:16, background:'var(--acc)', borderRadius:2 }}/>
        {title}
      </div>
      {children}
    </div>
  );

  const COUNTRY_EMOJI: Record<string,string> = { 'India':'🇮🇳','United Arab Emirates':'🇦🇪','Saudi Arabia':'🇸🇦','Kuwait':'🇰🇼','Qatar':'🇶🇦','Bahrain':'🇧🇭','Oman':'🇴🇲','Singapore':'🇸🇬','Malaysia':'🇲🇾','Indonesia':'🇮🇩','Thailand':'🇹🇭','Philippines':'🇵🇭','Nepal':'🇳🇵','Bangladesh':'🇧🇩','Sri Lanka':'🇱🇰' };
  const GW_COLORS: Record<string,string> = { razorpay:'#4f46e5', cashfree:'#10b981', easebuzz:'#f59e0b', paypal:'#0070ba', stripe:'#635bff' };

  return (
    <div>
      <div className="topbar" style={{ marginBottom:20 }}>
        <div className="topbar-left">
          <h1>Reporting <span>Analytics</span></h1>
          <p>{rows.length.toLocaleString()} records · {paid.length.toLocaleString()} paid</p>
        </div>
        <div className="topbar-right" style={{ gap:10 }}>
          <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)}
            style={{ border:'1.5px solid var(--bd)', borderRadius:10, padding:'7px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', cursor:'pointer', minWidth:160 }}>
            <option value="">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ display:'flex', gap:4 }}>
            {TIMELINE_OPTIONS.map(opt => (
              <button key={opt.label} onClick={() => setTimelineDays(opt.days)}
                style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                  background: timelineDays === opt.days ? 'var(--acc)' : 'transparent',
                  borderColor: timelineDays === opt.days ? 'var(--acc)' : 'var(--bd)',
                  color: timelineDays === opt.days ? '#fff' : 'var(--m)', transition:'all .12s' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Section title="Summary">
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <KPI icon="🏫" label="Schools Registered"  val={schoolSet.length}  color='var(--acc)'/>
          <KPI icon="🌍" label="Countries Reached"    val={countrySet.length} color='#8b5cf6'/>
          <KPI icon="👨‍🎓" label="Total Students"       val={rows.length}       color='#06b6d4'/>
          <KPI icon="✅" label="Paid Students"         val={paid.length}       sub={`${rows.length ? Math.round(paid.length/rows.length*100) : 0}% conversion`} color='#10b981'/>
          <KPI icon="₹"  label="INR Collected"        val={`₹${fmtAmt(inrRev)}`} sub={`${inrPaid.length} txns`} color='#4f46e5'/>
          <KPI icon="$"  label="USD Collected"        val={`$${fmtAmt(usdRev)}`} sub={`${usdPaid.length} txns`} color='#22c55e'/>
        </div>
      </Section>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:32 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}><span>🏫</span> Schools Registered — {schoolSet.length}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
            {schoolStats.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--m2)', fontSize:13 }}>No data for this period</div>
              : schoolStats.map((s,i) => (
                <div key={s.name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:10, color:'var(--m2)', width:18, textAlign:'right', flexShrink:0 }}>{i+1}</span>
                  <div style={{ fontSize:12, fontWeight:600, minWidth:0, flex:'0 0 140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.name}>{s.name}</div>
                  <MiniBar val={s.total} max={maxOf(schoolStats.map(x => x.total))} />
                  <span style={{ fontSize:11, color:'#10b981', fontWeight:700, flexShrink:0 }}>{s.paid}✓</span>
                </div>
              ))}
          </div>
        </div>
        <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}><span>🌍</span> Countries — {countrySet.length}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
            {countryStats.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--m2)', fontSize:13 }}>No data for this period</div>
              : countryStats.map((c,i) => (
                <div key={c.country} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{COUNTRY_EMOJI[c.country] ?? '🌍'}</span>
                  <div style={{ fontSize:12, fontWeight:600, flex:'0 0 120px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.country}</div>
                  <MiniBar val={c.total} max={maxOf(countryStats.map(x => x.total))} color='#8b5cf6'/>
                  <span style={{ fontSize:10, color:'var(--m)', flexShrink:0 }}>{c.schools} sch</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <Section title="Country-wise Schools & Students">
        <div className="tbl-wrap"><table>
          <thead><tr><th>Country</th><th>Schools</th><th>Total Students</th><th>Paid</th><th>Revenue (₹)</th><th>Conv%</th></tr></thead>
          <tbody>
            {countryStats.length === 0
              ? <tr><td colSpan={6} className="table-empty">No data</td></tr>
              : countryStats.map(c => (
                <tr key={c.country}>
                  <td><span style={{ fontWeight:700 }}>{COUNTRY_EMOJI[c.country] ?? '🌍'} {c.country}</span></td>
                  <td><span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{c.schools}</span></td>
                  <td><MiniBar val={c.total} max={maxOf(countryStats.map(x => x.total))} color='#06b6d4'/></td>
                  <td><span style={{ color:'#10b981', fontWeight:700 }}>{c.paid}</span></td>
                  <td><span className="amt">₹{fmtAmt(c.rev)}</span></td>
                  <td>{c.total ? Math.round(c.paid/c.total*100) : 0}%</td>
                </tr>
              ))}
          </tbody>
        </table></div>
      </Section>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:32 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>📚 Class-wise Students</div>
          <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:340, overflowY:'auto' }}>
            {classStats.length === 0
              ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--m2)', fontSize:13 }}>No data</div>
              : classStats.map(c => (
                <div key={c.cls} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6, fontSize:11, fontWeight:700, flexShrink:0, minWidth:70, textAlign:'center' }}>{c.cls}</span>
                  <MiniBar val={c.total} max={maxOf(classStats.map(x => x.total))} color='#8b5cf6'/>
                  <span style={{ fontSize:10, color:'#10b981', fontWeight:700, flexShrink:0 }}>{c.paid}✓</span>
                </div>
              ))}
          </div>
        </div>
        <div style={{ background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>⚧ Gender-wise</div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            {genderStats.map(g => {
              const color = g.gender==='Male'?'#2563eb':g.gender==='Female'?'#db2777':'#7c3aed';
              const icon  = g.gender==='Male'?'👦':g.gender==='Female'?'👧':'🧑';
              return (
                <div key={g.gender} style={{ flex:1, background:`${color}11`, border:`1.5px solid ${color}33`, borderRadius:12, padding:'14px', textAlign:'center' }}>
                  <div style={{ fontSize:24 }}>{icon}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--m)', marginTop:4 }}>{g.gender}</div>
                  <div style={{ fontSize:24, fontWeight:800, fontFamily:'Sora', color, marginTop:4 }}>{g.total}</div>
                  <div style={{ fontSize:10, color:'var(--m)', marginTop:2 }}>{g.paid} paid</div>
                </div>
              );
            })}
            {unknownGender > 0 && (
              <div style={{ flex:1, background:'rgba(148,163,184,0.08)', border:'1.5px solid rgba(148,163,184,0.2)', borderRadius:12, padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:24 }}>❓</div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--m)', marginTop:4 }}>Unknown</div>
                <div style={{ fontSize:24, fontWeight:800, fontFamily:'Sora', color:'var(--m)', marginTop:4 }}>{unknownGender}</div>
              </div>
            )}
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--m)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>By Class</div>
          <div style={{ maxHeight:180, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr>
                <th style={{ textAlign:'left', padding:'4px 6px', color:'var(--m)', fontWeight:600 }}>Class</th>
                <th style={{ textAlign:'center', padding:'4px 6px', color:'#2563eb', fontWeight:700 }}>M</th>
                <th style={{ textAlign:'center', padding:'4px 6px', color:'#db2777', fontWeight:700 }}>F</th>
                <th style={{ textAlign:'center', padding:'4px 6px', color:'#7c3aed', fontWeight:700 }}>O</th>
                <th style={{ textAlign:'right',  padding:'4px 6px', color:'var(--acc)', fontWeight:700 }}>Tot</th>
              </tr></thead>
              <tbody>
                {classStats.map(c => (
                  <tr key={c.cls} style={{ borderTop:'1px solid var(--bd)' }}>
                    <td style={{ padding:'4px 6px', fontWeight:600, color:'var(--acc)' }}>{c.cls}</td>
                    <td style={{ textAlign:'center', padding:'4px 6px', fontWeight:700, color:'#2563eb' }}>{c.byGender['Male'] || 0}</td>
                    <td style={{ textAlign:'center', padding:'4px 6px', fontWeight:700, color:'#db2777' }}>{c.byGender['Female'] || 0}</td>
                    <td style={{ textAlign:'center', padding:'4px 6px', fontWeight:700, color:'#7c3aed' }}>{c.byGender['Other'] || 0}</td>
                    <td style={{ textAlign:'right',  padding:'4px 6px', fontWeight:800, color:'var(--text)' }}>{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Section title="Classwise x Country-wise Matrix">
        <div style={{ overflowX:'auto', background:'var(--card)', border:'1px solid var(--bd)', borderRadius:14, padding:'4px' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:700, color:'var(--m)', fontSize:11, background:'rgba(255,255,255,0.03)', borderBottom:'1.5px solid var(--bd)', position:'sticky', left:0 }}>Class</th>
                {topCountries.map(c => (
                  <th key={c} style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'var(--m)', fontSize:11, background:'rgba(255,255,255,0.03)', borderBottom:'1.5px solid var(--bd)', whiteSpace:'nowrap' }}>
                    {COUNTRY_EMOJI[c] ?? '🌍'} {c}
                  </th>
                ))}
                <th style={{ padding:'10px 14px', textAlign:'center', fontWeight:700, color:'var(--acc)', fontSize:11, background:'rgba(255,255,255,0.03)', borderBottom:'1.5px solid var(--bd)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {classCountry.length === 0
                ? <tr><td colSpan={topCountries.length+2} className="table-empty">No data</td></tr>
                : classCountry.map((row,i) => (
                  <tr key={row.cls} style={{ background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding:'9px 16px', fontWeight:700, color:'var(--acc)', fontSize:12, position:'sticky', left:0, background: i%2===0?'var(--card)':'rgba(255,255,255,0.015)', borderBottom:'1px solid var(--bd)' }}>
                      <span style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 10px', borderRadius:6 }}>{row.cls}</span>
                    </td>
                    {topCountries.map(c => (
                      <td key={c} style={{ padding:'9px 14px', textAlign:'center', borderBottom:'1px solid var(--bd)', fontWeight: row[c]>0?700:400, color: row[c]>0?'var(--text)':'var(--m2)', fontSize:13 }}>
                        {row[c] || '—'}
                      </td>
                    ))}
                    <td style={{ padding:'9px 14px', textAlign:'center', borderBottom:'1px solid var(--bd)', fontWeight:800, color:'var(--acc)', fontSize:14 }}>{row.total}</td>
                  </tr>
                ))}
              <tr style={{ background:'rgba(79,70,229,0.06)' }}>
                <td style={{ padding:'9px 16px', fontWeight:800, color:'var(--m)', fontSize:11, position:'sticky', left:0, background:'rgba(79,70,229,0.06)' }}>TOTAL</td>
                {topCountries.map(c => (
                  <td key={c} style={{ padding:'9px 14px', textAlign:'center', fontWeight:800, color:'var(--acc)', fontSize:13 }}>
                    {rows.filter(r => (r.country ?? 'India') === c).length || '—'}
                  </td>
                ))}
                <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:900, color:'var(--acc)', fontSize:15 }}>{rows.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Payment Collected">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div style={{ background:'var(--card)', border:'2px solid rgba(79,70,229,0.25)', borderRadius:14, padding:'20px 24px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', marginBottom:6 }}>🇮🇳 INR COLLECTIONS</div>
            <div style={{ fontSize:32, fontWeight:800, fontFamily:'Sora', color:'var(--acc)' }}>₹{fmtAmt(inrRev)}</div>
            <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12, color:'var(--m)' }}>
              <span>{inrPaid.length} transactions</span>
              <span>Avg ₹{inrPaid.length ? fmtAmt(Math.round(inrRev/inrPaid.length)) : '0'}</span>
            </div>
          </div>
          <div style={{ background:'var(--card)', border:'2px solid rgba(34,197,94,0.25)', borderRadius:14, padding:'20px 24px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--m)', marginBottom:6 }}>🌐 USD COLLECTIONS</div>
            <div style={{ fontSize:32, fontWeight:800, fontFamily:'Sora', color:'#22c55e' }}>${fmtAmt(usdRev)}</div>
            <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12, color:'var(--m)' }}>
              <span>{usdPaid.length} transactions</span>
              <span>Avg ${usdPaid.length ? fmtAmt(Math.round(usdRev/usdPaid.length)) : '0'}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Payment Mode Breakdown">
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
          {gatewayStats.map((g,i) => {
            const COLORS = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
            const color  = GW_COLORS[g.gw] ?? COLORS[i % COLORS.length];
            return (
              <div key={g.gw} style={{ background:'var(--card)', border:`1.5px solid ${color}44`, borderRadius:12, padding:'14px 18px', flex:1, minWidth:140 }}>
                <span className="gw-tag" style={{ fontSize:12 }}>{g.gw}</span>
                <div style={{ fontSize:26, fontWeight:800, fontFamily:'Sora', color, margin:'8px 0 2px' }}>{g.total}</div>
                <div style={{ fontSize:11, color:'var(--m)' }}>{g.paid} paid · {g.total ? Math.round(g.paid/g.total*100) : 0}%</div>
                <div style={{ fontSize:11, color, fontWeight:700, marginTop:2 }}>₹{fmtAmt(g.rev)}</div>
              </div>
            );
          })}
          {gatewayStats.length === 0 && <div style={{ color:'var(--m2)', fontSize:13, padding:'20px' }}>No payment data</div>}
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Gateway</th><th>Attempts</th><th>Paid</th><th>Failed / Pending</th><th>Revenue</th><th>Conv%</th></tr></thead>
          <tbody>
            {gatewayStats.length === 0
              ? <tr><td colSpan={6} className="table-empty">No data</td></tr>
              : gatewayStats.map(g => (
                <tr key={g.gw}>
                  <td><span className="gw-tag">{g.gw}</span></td>
                  <td><MiniBar val={g.total} max={maxOf(gatewayStats.map(x => x.total))} /></td>
                  <td><span style={{ color:'#10b981', fontWeight:700 }}>{g.paid}</span></td>
                  <td style={{ color:'#ef4444', fontWeight:600 }}>{g.total - g.paid}</td>
                  <td><span className="amt">₹{fmtAmt(g.rev)}</span></td>
                  <td style={{ fontWeight:700 }}>{g.total ? Math.round(g.paid/g.total*100) : 0}%</td>
                </tr>
              ))}
          </tbody>
        </table></div>
      </Section>
    </div>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize:14, fontWeight:700, color:'var(--m)', margin:'24px 0 12px', textTransform:'uppercase', letterSpacing:'.06em' }}>{children}</h3>;
}

function IntCard({ provider, cfg, onEdit, onToggle }: { provider:string; cfg:Row|undefined; onEdit:()=>void; onToggle:()=>void }) {
  const labels: Record<string,string> = { razorpay:'Razorpay', cashfree:'Cashfree', easebuzz:'Easebuzz', paypal:'PayPal', smtp:'SMTP Email', sendgrid:'SendGrid', aws_ses:'AWS SES', whatsapp_cloud:'WhatsApp Cloud API', twilio:'Twilio WhatsApp' };
  const icons:  Record<string,string> = { razorpay:'💳', cashfree:'💳', easebuzz:'💳', paypal:'🅿️', smtp:'📧', sendgrid:'📨', aws_ses:'☁️', whatsapp_cloud:'💬', twilio:'💬' };
  const active = cfg?.is_active ?? false;
  return (
    <div style={{ background:'var(--card)', border:`2px solid ${active?'var(--green)':'var(--bd)'}`, borderRadius:14, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ fontSize:24 }}>{icons[provider] ?? '⚙️'}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{labels[provider] ?? provider}</div>
        <div style={{ fontSize:11, color: active?'var(--green)':'var(--m2)', marginTop:2 }}>{cfg ? (active ? '✅ Active & configured' : '⚠️ Configured but inactive') : '⬜ Not configured'}</div>
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={onEdit}>{cfg ? 'Edit' : 'Setup'}</button>
        {cfg && <button className="btn" style={{ fontSize:11, padding:'4px 10px', background: active?'var(--red2)':'var(--green2)', color: active?'var(--red)':'var(--green)', border:'none' }} onClick={onToggle}>{active ? 'Disable' : 'Enable'}</button>}
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth:580 }}>
        <div className="modal-head"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ padding:'20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return <div style={{ marginBottom:14 }}><label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--m)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</label>{children}</div>;
}

const IS: React.CSSProperties = { width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)' };
const SS: React.CSSProperties = { ...IS, appearance:'none' as any };

// ── All form modals (Program, School, Discount, User, Integration, Trigger, Template) ──
// These are unchanged from your original — paste them in here exactly as they were.
// Only the two files above (route.ts and the dashboard component) contain the fixes.
// For brevity they are omitted here but must be included in your actual file.

function ProgramFormModal({ initial, onClose, onSave }: { initial:Row; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({
    id: initial.id??'', name: initial.name??'', slug: initial.slug??'',
    base_amount_inr: initial.base_amount_inr ? String(initial.base_amount_inr/100) : '',
    base_amount_usd: initial.base_amount_usd ? String(initial.base_amount_usd/100) : '',
    status: initial.status??'active',
    allowed_grades: (initial.allowed_grades ?? []) as string[],
  });
  const [allGrades, setAllGrades]       = useState<Row[]>([]);
  const [gradesLoading, setGradesLoading] = useState(true);
  useEffect(() => {
    fetch(`${BACKEND}/api/admin/grades?active=true`, { credentials:'include' })
      .then(r => r.json()).then(d => { setAllGrades(d.grades??[]); setGradesLoading(false); }).catch(() => setGradesLoading(false));
  }, []);
  const set = (k:string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const autoSlug = (name:string) => name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  function toggleGrade(gradeName:string) { setF(p => { const already = p.allowed_grades.includes(gradeName); return { ...p, allowed_grades: already ? p.allowed_grades.filter(g => g!==gradeName) : [...p.allowed_grades, gradeName] }; }); }
  function selectAll()  { setF(p => ({ ...p, allowed_grades: allGrades.map(g => g.name) })); }
  function selectNone() { setF(p => ({ ...p, allowed_grades: [] })); }
  return (
    <ModalShell title={f.id ? 'Edit Program' : 'New Program'} onClose={onClose}>
      <Field label="Program Name *"><input style={IS} value={f.name} onChange={e => { setF(p => ({ ...p, name: e.target.value, slug: p.slug || autoSlug(e.target.value) })); }} placeholder="e.g. Thynk Success 2025"/></Field>
      <Field label="Slug * (used in URL)"><input style={IS} value={f.slug} onChange={set('slug')} placeholder="thynk-success-2025" disabled={!!f.id}/></Field>
      <p style={{ fontSize:11, color:'var(--m)', marginTop:-10, marginBottom:12 }}>Registration URL: <code>www.thynksuccess.com/registration/{f.slug||'[slug]'}/[schoolcode]</code></p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
        <Field label="Base Price — INR (₹) *">
          <div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontWeight:700, color:'var(--m)', fontSize:14, pointerEvents:'none' }}>₹</span><input style={{ ...IS, paddingLeft:26 }} type="number" value={f.base_amount_inr} onChange={set('base_amount_inr')} placeholder="e.g. 1200" required/></div>
          <p style={{ fontSize:10, color:'var(--m)', marginTop:3 }}>Required — used for Indian schools</p>
        </Field>
        <Field label="Base Price — USD ($) (optional)">
          <div style={{ position:'relative' }}><span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontWeight:700, color:'var(--m)', fontSize:14, pointerEvents:'none' }}>$</span><input style={{ ...IS, paddingLeft:26 }} type="number" value={f.base_amount_usd} onChange={set('base_amount_usd')} placeholder="e.g. 50 (optional)"/></div>
          <p style={{ fontSize:10, color:'var(--m)', marginTop:3 }}>Optional — leave blank for India-only programs</p>
        </Field>
        <Field label="Status"><select style={SS} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>
      <div style={{ marginTop:18, marginBottom:4 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.04em' }}>Allowed Grades *</label>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" onClick={selectAll}  style={{ padding:'3px 10px', borderRadius:6, border:'1.5px solid var(--acc)', background:'transparent', color:'var(--acc)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>All</button>
            <button type="button" onClick={selectNone} style={{ padding:'3px 10px', borderRadius:6, border:'1.5px solid var(--bd)',  background:'transparent', color:'var(--m)',   fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>None</button>
          </div>
        </div>
        {gradesLoading ? (
          <div style={{ padding:'14px 0', fontSize:12, color:'var(--m)' }}>Loading grades…</div>
        ) : allGrades.length === 0 ? (
          <div style={{ padding:'12px 16px', borderRadius:10, border:'1.5px dashed var(--bd)', fontSize:12, color:'var(--m)', textAlign:'center' }}>No grades configured. Go to <strong>Settings → Grade Master</strong> to add grades first.</div>
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8, padding:'14px 16px', border:'1.5px solid var(--bd)', borderRadius:10, background:'var(--bg)', maxHeight:220, overflowY:'auto' }}>
              {allGrades.map(g => {
                const checked = f.allowed_grades.includes(g.name);
                return (
                  <label key={g.id} onClick={() => toggleGrade(g.name)}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, border:`1.5px solid ${checked?'var(--acc)':'var(--bd)'}`, background: checked?'var(--acc3)':'var(--card)', cursor:'pointer', transition:'all .12s', userSelect:'none' }}>
                    <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${checked?'var(--acc)':'var(--bd)'}`, background: checked?'var(--acc)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .12s' }}>
                      {checked && <span style={{ color:'#fff', fontSize:10, fontWeight:800, lineHeight:1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily:'DM Sans,sans-serif', fontSize:12, fontWeight: checked?700:500, color: checked?'var(--acc)':'var(--text)', whiteSpace:'nowrap' }}>{g.name}</span>
                  </label>
                );
              })}
            </div>
            <p style={{ fontSize:10, color:'var(--m)', marginTop:5 }}>{f.allowed_grades.length===0 ? '⚠️ No grades selected — registration form will show all active grades as fallback.' : `${f.allowed_grades.length} of ${allGrades.length} grades selected.`}</p>
          </>
        )}
      </div>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave({ id:f.id, name:f.name, slug:f.slug, status:f.status, base_amount_inr: f.base_amount_inr ? Math.round(Number(f.base_amount_inr)*100) : 0, base_amount_usd: f.base_amount_usd ? Math.round(Number(f.base_amount_usd)*100) : null, base_amount: f.base_amount_inr ? Math.round(Number(f.base_amount_inr)*100) : 0, currency:'INR', allowed_grades:f.allowed_grades })}>{f.id ? 'Save Changes' : 'Create Program'}</button>
      </div>
    </ModalShell>
  );
}

// ── Location data & School/Discount/User/Integration/Trigger/Template forms ──
// Paste the rest of your original file unchanged from here down.
// (SchoolFormModal, SchoolsTable, DiscountFormModal, UserFormModal,
//  IntegrationFormModal, TriggerFormModal, TemplateFormModal,
//  LocationMasterPage, LocationFormModal, StudentsTable,
//  FollowUpList, CityHeatmap, Timeline — all unchanged)
