'use client';
import Script from 'next/script';
import { authFetch } from '@/lib/supabase/client';
import AdminApprovalQueue from '@/components/admin/AdminApprovalQueue';
import { SchoolsPageWithApproval } from '@/components/admin/SchoolsPageWithApproval';
import { SchoolLogPanel } from '@/components/admin/SchoolLogPanel';
import { StudentLogPanel } from '@/components/admin/StudentLogPanel';
import { ReportingPage } from '@/components/admin/ReportingPage';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const fmt  = (n: any) => { const v = parseFloat(String(n??0).replace(/[^0-9.]/g,'')); return isNaN(v)?'0':v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p/100);
// Currency helpers — India = INR (₹), everywhere else = USD ($)
const currSymbol = (country?: string) => (!country || country === 'India') ? '₹' : '$';
const fmtAmt     = (p: number, country?: string) => `${currSymbol(country)}${fmtR(p)}`;
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
  { section:'Logs' },
  { id:'logs_schools',  icon:'🏫', label:'School Logs'       },
  { id:'logs_students', icon:'👨‍🎓', label:'Student Logs'      },
  { id:'logs_email',    icon:'📧', label:'Email Logs'        },
  { id:'logs_whatsapp', icon:'💬', label:'WhatsApp Logs'     },
  { section:'Settings' },
  { id:'_settings',     icon:'📍', label:'Settings & Locations', href:'/admin/settings' },
  { section:'Tools' },
  { id:'_export',       icon:'⬇️', label:'Export CSV', action:true },
  { id:'_refresh',      icon:'🔄', label:'Refresh',    action:true },
];

// ── Student Detail Modal with Template Send ─────────────────────────────────
function StudentDetailModal({
  student,
  onClose,
  showToast,
  fmtR,
}: {
  student: Row;
  onClose: () => void;
  showToast: (m: string, i?: string) => void;
  fmtR: (n: number) => string;
}) {
  const [templates,   setTemplates]   = React.useState<Row[]>([]);
  const [sendChannel, setSendChannel] = React.useState<'whatsapp' | 'email' | null>(null);
  const [selectedTpl, setSelectedTpl] = React.useState('');
  const [toPhone,     setToPhone]     = React.useState(student.contact_phone ?? '');
  const [toEmail,     setToEmail]     = React.useState(student.contact_email ?? '');
  const [sending,     setSending]     = React.useState(false);
  const [preview,     setPreview]     = React.useState('');

  React.useEffect(() => {
    authFetch(`${BACKEND}/api/admin/templates`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTemplates((d?.templates ?? []).filter((t: Row) => t.is_active)))
      .catch(() => {});
  }, []);

  const channelTemplates = templates.filter(t => t.channel === sendChannel);

  React.useEffect(() => {
    if (!selectedTpl) { setPreview(''); return; }
    const tpl = templates.find(t => t.id === selectedTpl);
    if (!tpl) return;
    const vars: Record<string, string> = {
      student_name:  student.student_name  ?? '',
      parent_name:   student.parent_name   ?? '',
      class_grade:   student.class_grade   ?? '',
      gender:        student.gender        ?? '',
      school_name:   student.school_name   ?? '',
      program_name:  student.program_name  ?? '',
      city:          student.city          ?? '',
      amount:        student.final_amount  ? `${currSymbol(student.country)}${fmtR(student.final_amount)}` : '',
      txn_id:        student.gateway_txn_id ?? '',
      contact_phone: student.contact_phone ?? '',
      contact_email: student.contact_email ?? '',
    };
    const rendered = tpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`);
    setPreview(rendered);
  }, [selectedTpl, templates, student]);

  async function handleSend() {
    if (!sendChannel || !selectedTpl) return;
    setSending(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel:         sendChannel,
          template_id:     selectedTpl,
          school_id:       student.school_id,
          registration_id: student.id,
          to_phone:        toPhone,
          to_email:        toEmail,
          vars: {
            student_name:  student.student_name  ?? '',
            parent_name:   student.parent_name   ?? '',
            class_grade:   student.class_grade   ?? '',
            gender:        student.gender        ?? '',
            school_name:   student.school_name   ?? '',
            program_name:  student.program_name  ?? '',
            city:          student.city          ?? '',
            amount:        student.final_amount  ? `${currSymbol(student.country)}${fmtR(student.final_amount)}` : '',
            txn_id:        student.gateway_txn_id ?? '',
            contact_phone: student.contact_phone ?? '',
            contact_email: student.contact_email ?? '',
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`\u2705 ${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'} sent via ${data.provider}!`, '\u2705');
        setSendChannel(null);
        setSelectedTpl('');
        setPreview('');
      } else {
        showToast(`\u274c Send failed: ${data.error}`, '\u274c');
      }
    } catch (e: any) {
      showToast(`\u274c Network error: ${e.message}`, '\u274c');
    }
    setSending(false);
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1.5px solid var(--bd)', borderRadius: 10,
    padding: '9px 12px', fontSize: 13, fontFamily: 'DM Sans,sans-serif',
    outline: 'none', color: 'var(--text)', background: 'var(--card)', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--m)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em',
  };

  const currency = student.currency === 'USD' ? '$' : '\u20b9';
  const rows: [string, React.ReactNode][] = [
    ['Status',   <span key="s" className={`badge badge-${student.payment_status ?? 'pending'}`}>{student.payment_status ?? '\u2014'}</span>],
    ['Date',     student.created_at?.slice(0, 10) ?? '\u2014'],
    ['Student',  student.student_name],
    ['Class',    student.class_grade],
    ['Gender',   student.gender],
    ['Program',  student.program_name ?? '\u2014'],
    ['Country',  student.country ?? '\u2014'],
    ['School',   student.school_name ?? student.parent_school ?? '\u2014'],
    ['City',     student.city],
    ['Parent',   student.parent_name],
    ['Phone',    <a key="p" href={`tel:${student.contact_phone}`} style={{ color: 'var(--acc)', fontWeight: 600 }}>{student.contact_phone}</a>],
    ['Email',    <a key="e" href={`mailto:${student.contact_email}`} style={{ color: 'var(--acc)', fontSize: 12 }}>{student.contact_email}</a>],
    ['Gateway',  student.gateway ?? '\u2014'],
    ['Base',     `${currency}${fmtR(student.base_amount ?? 0)}`],
    ['Discount', student.discount_code ? `\ud83c\udff7\ufe0f ${student.discount_code} (${currency}${fmtR(student.discount_amount ?? 0)} off)` : 'None'],
    ['Paid',     <span key="a" style={{ fontFamily: 'Sora', fontWeight: 800, color: 'var(--green)', fontSize: 18 }}>{currency}{fmtR(student.final_amount ?? 0)}</span>],
    ['Txn ID',   <span key="t" style={{ fontSize: 11, color: 'var(--m2)', wordBreak: 'break-all' }}>{student.gateway_txn_id ?? '\u2014'}</span>],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1.5px solid var(--bd)' }}>
          <h3 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{student.student_name}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m)', fontSize: 22, lineHeight: 1 }}>&#x2715;</button>
        </div>

        <div style={{ padding: '0 24px' }}>
          {rows.map(([l, v]) => (
            <div key={String(l)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ fontSize: 13, color: 'var(--m)', fontFamily: 'DM Sans,sans-serif', flexShrink: 0, minWidth: 90 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', textAlign: 'right' }}>{v}</div>
            </div>
          ))}
        </div>

        {sendChannel && (
          <div style={{ margin: '16px 24px', padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1.5px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Sora,sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {sendChannel === 'whatsapp' ? '\ud83d\udcac Send WhatsApp' : '\u2709\ufe0f Send Email'}
            </div>
            <div>
              <label style={lbl}>{sendChannel === 'whatsapp' ? 'Phone Number' : 'Email Address'}</label>
              {sendChannel === 'whatsapp'
                ? <input style={inp} value={toPhone} onChange={e => setToPhone(e.target.value)} placeholder="91XXXXXXXXXX" />
                : <input style={inp} value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="parent@email.com" />
              }
            </div>
            <div>
              <label style={lbl}>Select Template *</label>
              <select style={{ ...inp, cursor: 'pointer', appearance: 'none' as any }} value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}>
                <option value="">&#8212; Choose a template &#8212;</option>
                {channelTemplates.length === 0
                  ? <option disabled>No active {sendChannel} templates found</option>
                  : channelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
            </div>
            {preview && (
              <div style={{ background: sendChannel === 'whatsapp' ? 'rgba(26,184,168,.07)' : 'rgba(79,70,229,.07)', borderRadius: 9, padding: '10px 14px', border: `1px solid ${sendChannel === 'whatsapp' ? 'rgba(26,184,168,.25)' : 'rgba(79,70,229,.2)'}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Preview</div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{preview}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setSendChannel(null); setSelectedTpl(''); setPreview(''); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--bd)', background: 'var(--card)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--m)' }}>
                Cancel
              </button>
              <button onClick={handleSend}
                disabled={sending || !selectedTpl || (sendChannel === 'whatsapp' ? !toPhone : !toEmail)}
                style={{ flex: 2, padding: '9px 0', borderRadius: 9, background: sendChannel === 'whatsapp' ? '#1ab8a8' : 'var(--acc)', border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', opacity: (sending || !selectedTpl) ? 0.6 : 1 }}>
                {sending ? '\u23f3 Sending\u2026' : `Send ${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
              </button>
            </div>
          </div>
        )}

        {!sendChannel && (
          <div style={{ display: 'flex', gap: 10, padding: '16px 24px 20px' }}>
            <button onClick={() => { setSendChannel('whatsapp'); setToPhone(student.contact_phone ?? ''); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(26,184,168,.35)', background: 'rgba(26,184,168,.08)', color: '#0e8a7d', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              \ud83d\udcac WhatsApp
            </button>
            <a href={`tel:${student.contact_phone}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.06)', color: '#dc2626', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              \ud83d\udcde Call
            </a>
            <button onClick={() => { setSendChannel('email'); setToEmail(student.contact_email ?? ''); }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 12, border: '1.5px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.07)', color: '#b45309', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              \u2709\ufe0f Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const [programs,     setPrograms]     = useState<Row[]>([]);
  const [schools,      setSchools]      = useState<Row[]>([]);
  const [discounts,    setDiscounts]    = useState<Row[]>([]);
  const [adminUsers,   setAdminUsers]   = useState<Row[]>([]);
  const [integrations, setIntegrations] = useState<Row[]>([]);
  const [triggers,     setTriggers]     = useState<Row[]>([]);
  const [templates,    setTemplates]    = useState<Row[]>([]);
  const [locations,    setLocations]    = useState<Row[]>([]);
  const [activityLogs, setActivityLogs] = useState<Row[]>([]);

  const [logSchools,         setLogSchools]         = useState<Row[]>([]);
  const [logSelectedSchool,  setLogSelectedSchool]  = useState<Row|null>(null);
  const [logAllStudents,     setLogAllStudents]      = useState<Row[]>([]);
  const [logSelectedStudent, setLogSelectedStudent] = useState<Row|null>(null);
  const [logEmailRows,       setLogEmailRows]        = useState<Row[]>([]);
  const [logWaRows,          setLogWaRows]           = useState<Row[]>([]);
  const [logEmailLoading,    setLogEmailLoading]     = useState(false);
  const [logWaLoading,       setLogWaLoading]        = useState(false);

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

  const authHeaders = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(accessTokenRef.current ? { 'Authorization': `Bearer ${accessTokenRef.current}` } : {}),
  }), []);

  const api = useCallback((path: string, opts?: RequestInit) =>
    fetch(`${BACKEND}${path}`, {
      credentials: 'include',
      headers: { ...(accessTokenRef.current ? { 'Authorization': `Bearer ${accessTokenRef.current}` } : {}), ...(opts?.headers ?? {}) },
      ...opts,
    }).then(r => r.json()), []);

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
    if (activePage === 'overview')     loadPrograms();
    if (activePage === 'reporting')  { loadPrograms(); loadSchools(); }
    if (activePage === 'students')     loadPrograms();
    if (activePage === 'programs')     loadPrograms();
    if (activePage === 'schools')      loadSchools();
    if (activePage === 'discounts')    loadDiscounts();
    if (activePage === 'users')        loadUsers();
    if (activePage === 'integrations') loadIntegrations();
    if (activePage === 'triggers')   { loadTriggers(); loadTemplates(); loadSchools(); }
    if (activePage === 'templates')    loadTemplates();
    if (activePage === 'locations')    loadLocations();
    if (activePage === 'recent') {
      api('/api/admin/activity-logs?limit=200').then((d: any) => setActivityLogs(d.logs ?? [])).catch(() => {});
    }
    if (activePage === 'logs_schools' || activePage === 'logs_students' || activePage === 'logs_email' || activePage === 'logs_whatsapp') {
      loadSchools();
      api('/api/admin/registrations?limit=1000').then((d: any) => setLogAllStudents((d.rows??[]).filter((r:Row)=>r.student_name?.trim())));
    }
    if (activePage === 'logs_email') {
      setLogEmailLoading(true);
      api('/api/admin/notification-logs?channel=email&limit=200').then((d:any)=>{ setLogEmailRows(d.logs??[]); setLogEmailLoading(false); }).catch(()=>setLogEmailLoading(false));
    }
    if (activePage === 'logs_whatsapp') {
      setLogWaLoading(true);
      api('/api/admin/notification-logs?channel=whatsapp&limit=200').then((d:any)=>{ setLogWaRows(d.logs??[]); setLogWaLoading(false); }).catch(()=>setLogWaLoading(false));
    }
  }, [activePage, user]);

  function showToast(text:string, icon='') {
    setToast({ text:`${icon} ${text}`.trim(), type: icon==='✅'?'ok':icon==='❌'?'err':'' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast({text:'',type:''}), 3500);
  }

  async function doLogout() { await createClient().auth.signOut(); router.push('/admin/login'); }

  useEffect(() => {
    if (!allRows.length) return;
    if (activePage==='overview')  renderOverviewCharts();
    if (activePage==='trends')    renderTrendCharts();
    if (activePage==='analytics') renderAnalyticsCharts();
  }, [activePage, allRows, trendDays, overviewProgram]);

  function dc(id:string) { if(chartsRef.current[id]){chartsRef.current[id].destroy();delete chartsRef.current[id];} }

  function renderOverviewCharts() {
    if (!(window as any).Chart) return;
    const C = (window as any).Chart;
    const filtered = overviewProgram ? allRows.filter(r=>r.program_name===overviewProgram) : allRows;
    const now  = new Date();
    dc('daily');
    const labels:string[]=[],paidArr:number[]=[],totalArr:number[]=[];
    for(let i=trendDays-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);labels.push(d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}));const day=filtered.filter(r=>r.created_at?.slice(0,10)===ds);totalArr.push(day.length);paidArr.push(day.filter(r=>r.payment_status==='paid').length);}
    const ctxD=(document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if(ctxD) chartsRef.current.daily=new C(ctxD,{type:'bar',data:{labels,datasets:[{label:'Total',data:totalArr,backgroundColor:'rgba(79,70,229,.12)',borderColor:'#4f46e5',borderWidth:2,borderRadius:8,borderSkipped:false},{label:'Paid',data:paidArr,backgroundColor:'rgba(16,185,129,.8)',borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}}}});
    dc('status');
    const sc:Record<string,number>={};filtered.forEach(r=>{const s=r.payment_status??'unknown';sc[s]=(sc[s]??0)+1;});
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
    const h=['Date','Student','Class','Gender','Program','Country','School','City','Parent','Phone','Email','Gateway','Status','Base','Discount Code','Discount Amt','Final','Txn ID'];
    const rows=[h,...allRows.map(r=>[r.created_at?.slice(0,10),r.student_name,r.class_grade,r.gender,r.program_name,r.country,r.parent_school,r.city,r.parent_name,r.contact_phone,r.contact_email,r.gateway,r.payment_status,(r.base_amount??0)/100,r.discount_code,(r.discount_amount??0)/100,(r.final_amount??0)/100,r.gateway_txn_id])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=`Thynk_${new Date().toISOString().slice(0,10)}.csv`;a.click();
    showToast('CSV exported!','✅');
  }

  function navAction(id:string, href?:string) {
    if (href) { window.location.href = href; return; }
    if (id==='_export')  { exportCSV(); return; }
    if (id==='_refresh') { loadRegistrations(); return; }
    setActivePage(id);
  }

  const ovRows  = overviewProgram ? allRows.filter(r=>r.program_name===overviewProgram) : allRows;
  const paid    = ovRows.filter(r=>r.payment_status==='paid');
  const pending = ovRows.filter(r=>['pending','initiated'].includes(r.payment_status));
  const failed  = ovRows.filter(r=>['failed','cancelled'].includes(r.payment_status));
  const totalRev  = paid.reduce((s,r)=>s+(r.final_amount??0),0);
  const inrPaidOv = paid.filter(r=>!r.country || r.country === 'India');
  const usdPaidOv = paid.filter(r=>r.country && r.country !== 'India');
  const inrRevOv  = inrPaidOv.reduce((s,r)=>s+(r.final_amount??0),0);
  const usdRevOv  = usdPaidOv.reduce((s,r)=>s+(r.final_amount??0),0);
  const conv = ovRows.length ? Math.round(paid.length/ovRows.length*100) : 0;
  const avg  = paid.length   ? Math.round(totalRev/paid.length)            : 0;
  const today    = new Date().toISOString().slice(0,10);
  const thisWeek = ovRows.filter(r=>new Date(r.created_at)>=new Date(Date.now()-7*24*60*60*1000)).length;
  const followUpCount = allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status)).length;

  const saveForm = async (path:string, data:Row, onDone:()=>void, successMsg:string) => {
    const method = data.id ? 'PATCH' : 'POST';
    const res = await fetch(`${BACKEND}${path}`, { credentials: 'include', method, headers: authHeaders(), body:JSON.stringify(data) });
    const r   = await res.json();
    if (!res.ok) { showToast(r.error ?? 'Error', '❌'); return; }
    showToast(successMsg, '✅');
    onDone();
  };

  if (!user) return null;

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" strategy="lazyOnload" />
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
              const isActive = !item.action && !('href' in item) && activePage===item.id;
              return (
                <button key={item.id} className={`sb-item${isActive?' active':''}`} onClick={()=>navAction(item.id!, (item as any).href)}>
                  <span className="icon">{item.icon}</span>{item.label}
                  {item.badge && followUpCount>0 && <span className="sb-badge">{followUpCount}</span>}
                  {('href' in item) && <span style={{fontSize:9,opacity:0.5,marginLeft:'auto'}}>↗</span>}
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

          {/* ── OVERVIEW ────────────────────────────────────────────── */}
          <div className={`page${activePage==='overview'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left">
                <h1>Overview <span>Dashboard</span></h1>
                <p>{lastUpdated}</p>
              </div>
              <div className="topbar-right">
                <select
                  value={overviewProgram}
                  onChange={e => setOverviewProgram(e.target.value)}
                  style={{ border:'1.5px solid var(--bd)', borderRadius:10, padding:'7px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', cursor:'pointer', minWidth:160 }}
                >
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <div className="badge-live"><div className="dot"/>Live Data</div>
                <button className="btn btn-outline" onClick={loadRegistrations}>🔄 Refresh</button>
                <button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button>
              </div>
            </div>

            {/* ── Hero Revenue Banner ──────────────────────────────── */}
            <div style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #1e3a5f 100%)',
              borderRadius: 20, padding: '28px 32px', marginBottom: 20,
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(79,70,229,0.25)',
            }}>
              {/* decorative blobs */}
              <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(139,92,246,0.15)', pointerEvents:'none' }}/>
              <div style={{ position:'absolute', bottom:-60, right:200, width:160, height:160, borderRadius:'50%', background:'rgba(16,185,129,0.1)', pointerEvents:'none' }}/>

              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:24, position:'relative', zIndex:1 }}>
                {/* Left: main revenue */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
                    💰 Total Revenue Collected{overviewProgram ? ` · ${overviewProgram}` : ''}
                  </div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                    <span style={{ fontSize:44, fontWeight:800, fontFamily:'Sora,sans-serif', color:'#fff', letterSpacing:'-1px', lineHeight:1 }}>
                      ₹{fmtR(inrRevOv)}
                    </span>
                    {usdRevOv > 0 && (
                      <span style={{ fontSize:22, fontWeight:700, color:'#4ade80', fontFamily:'Sora,sans-serif' }}>
                        + ${fmtR(usdRevOv)} USD
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:8 }}>
                    From <strong style={{ color:'#a5f3fc' }}>{paid.length}</strong> confirmed payments
                    &nbsp;·&nbsp; {ovRows.length} total registrations
                  </div>
                </div>

                {/* Right: quick stats strip */}
                <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                  {[
                    { icon:'📈', label:'Conversion', val:`${conv}%`,          color:'#a78bfa' },
                    { icon:'🎯', label:'Avg Ticket',  val:`₹${fmtR(avg)}`,    color:'#34d399' },
                    { icon:'📅', label:'Today',       val:ovRows.filter(r=>r.created_at?.slice(0,10)===today).length, color:'#fbbf24' },
                    { icon:'📆', label:'This Week',   val:thisWeek,            color:'#60a5fa' },
                    { icon:'🏷️', label:'Discounts',   val:ovRows.filter(r=>r.discount_code).length, color:'#f472b6' },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: 'rgba(255,255,255,0.07)', backdropFilter:'blur(4px)',
                      borderRadius:14, padding:'14px 18px', textAlign:'center', minWidth:90,
                      border:'1px solid rgba(255,255,255,0.12)',
                    }}>
                      <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                      <div style={{ fontSize:20, fontWeight:800, fontFamily:'Sora,sans-serif', color:s.color, lineHeight:1 }}>{s.val}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:4, fontWeight:600, letterSpacing:'.04em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Status Cards Row ──────────────────────────────────── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
              {[
                { color:'#4f46e5', bg:'rgba(79,70,229,0.08)',  border:'rgba(79,70,229,0.2)',  icon:'📋', label:'Total',     val:ovRows.length,  sub:'All registrations',       pct: null },
                { color:'#10b981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)', icon:'✅', label:'Paid',      val:paid.length,     sub:'Confirmed payments',      pct: ovRows.length ? Math.round(paid.length/ovRows.length*100) : 0 },
                { color:'#f59e0b', bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)', icon:'⏳', label:'Pending',   val:pending.length,  sub:'Awaiting payment',        pct: ovRows.length ? Math.round(pending.length/ovRows.length*100) : 0 },
                { color:'#ef4444', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.2)',  icon:'❌', label:'Failed',    val:failed.length,   sub:'Cancelled/failed',        pct: ovRows.length ? Math.round(failed.length/ovRows.length*100) : 0 },
                { color:'#8b5cf6', bg:'rgba(139,92,246,0.08)', border:'rgba(139,92,246,0.2)', icon:'🏷️', label:'Discounts', val:ovRows.filter(r=>r.discount_code).length, sub:'Used codes', pct: ovRows.length ? Math.round(ovRows.filter(r=>r.discount_code).length/ovRows.length*100) : 0 },
                { color:'#06b6d4', bg:'rgba(6,182,212,0.08)',  border:'rgba(6,182,212,0.2)',  icon:'🏫', label:'Schools',   val:[...new Set(ovRows.map(r=>r.school_name??r.parent_school).filter(Boolean))].length, sub:'Unique schools', pct: null },
              ].map(c => (
                <div key={c.label} style={{
                  background: c.bg, border:`1.5px solid ${c.border}`,
                  borderRadius:16, padding:'16px 14px',
                  display:'flex', flexDirection:'column', gap:4,
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
                    <span style={{ fontSize:20 }}>{c.icon}</span>
                    {c.pct !== null && (
                      <span style={{ fontSize:10, fontWeight:700, color:c.color, background:`${c.color}18`, padding:'2px 7px', borderRadius:20 }}>
                        {c.pct}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:28, fontWeight:800, fontFamily:'Sora,sans-serif', color:c.color, lineHeight:1 }}>{c.val}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{c.label}</div>
                  <div style={{ fontSize:10, color:'var(--m)', marginTop:1 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Period tabs + Secondary metrics ──────────────────── */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <span style={{ fontSize:12, color:'var(--m)', fontWeight:600 }}>Period:</span>
              <div className="period-tabs">
                {[7,14,30].map(d => (
                  <button key={d} className={`period-tab${trendDays===d?' active':''}`} onClick={() => setTrendDays(d)}>{d}d</button>
                ))}
              </div>
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                {/* Payment method breakdown pills */}
                {[...new Set(ovRows.map(r=>r.gateway).filter(Boolean))].slice(0,4).map(gw => {
                  const gwPaid = paid.filter(r=>r.gateway===gw).length;
                  const gwRev  = paid.filter(r=>r.gateway===gw).reduce((s,r)=>s+(r.final_amount??0),0);
                  return (
                    <div key={gw} style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'6px 12px', fontSize:11, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontWeight:700, color:'var(--text)' }}>{gw}</span>
                      <span style={{ color:'#10b981', fontWeight:700 }}>{gwPaid} paid</span>
                      <span style={{ color:'var(--m)' }}>·</span>
                      <span style={{ color:'var(--acc)', fontWeight:700 }}>₹{fmtR(gwRev)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Charts Row ────────────────────────────────────────── */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:14 }}>
              {/* Daily Bar + mini stats overlay */}
              <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>📅 Daily Registrations</div>
                    <div style={{ fontSize:11, color:'var(--m)', marginTop:2 }}>Last {trendDays} days — total vs paid</div>
                  </div>
                  <div style={{ display:'flex', gap:12 }}>
                    {/* mini legend */}
                    {[{color:'#4f46e5',label:'Total'},{color:'#10b981',label:'Paid'}].map(l=>(
                      <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--m)', fontWeight:600 }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:l.color }}/>
                        {l.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height:220, position:'relative' }}>
                  <canvas id="chartDaily"/>
                </div>
              </div>

              {/* Status doughnut + conversion meter */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px', flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>📊 Payment Status</div>
                  <div style={{ height:160, position:'relative' }}>
                    <canvas id="chartStatus"/>
                  </div>
                </div>

                {/* Conversion rate card */}
                <div style={{ background:'linear-gradient(135deg,rgba(16,185,129,0.1),rgba(6,182,212,0.07))', border:'1.5px solid rgba(16,185,129,0.25)', borderRadius:16, padding:'16px 18px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--m)', marginBottom:6 }}>⚡ Quick Metrics</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {[
                      { label:'Conversion Rate', val:`${conv}%`, color:'#10b981' },
                      { label:'Avg Ticket (INR)', val:`₹${fmtR(avg)}`, color:'#4f46e5' },
                      { label:'Follow-Up Queue', val:followUpCount, color:'#f59e0b' },
                    ].map(m => (
                      <div key={m.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'var(--m)', fontWeight:500 }}>{m.label}</span>
                        <span style={{ fontSize:14, fontWeight:800, color:m.color, fontFamily:'Sora,sans-serif' }}>{m.val}</span>
                      </div>
                    ))}
                    {/* Progress bar for conversion */}
                    <div style={{ marginTop:4, height:6, background:'var(--bd)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${Math.min(conv,100)}%`, height:'100%', background:'linear-gradient(90deg,#10b981,#06b6d4)', borderRadius:3, transition:'width .4s ease' }}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── School leaderboard + Top cities ──────────────────── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {/* Top schools by registrations */}
              <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>🏆 Top Schools by Paid Registrations</div>
                {(() => {
                  const schoolMap: Record<string, number> = {};
                  paid.forEach(r => { const k = r.school_name ?? r.parent_school ?? 'Unknown'; schoolMap[k] = (schoolMap[k] ?? 0) + 1; });
                  const sorted = Object.entries(schoolMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
                  const max = sorted[0]?.[1] ?? 1;
                  const medals = ['🥇','🥈','🥉'];
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {sorted.map(([name, count], i) => (
                        <div key={name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize: i<3?16:11, width:20, flexShrink:0, textAlign:'center', fontWeight:700, color:'#f59e0b' }}>
                            {i<3 ? medals[i] : i+1}
                          </span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }} title={name}>{name}</div>
                            <div style={{ marginTop:3, height:5, background:'var(--bd)', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ width:`${Math.round(count/max*100)}%`, height:'100%', background: i===0?'#fbbf24':i===1?'#9ca3af':i===2?'#b45309':'var(--acc)', borderRadius:3 }}/>
                            </div>
                          </div>
                          <span style={{ fontSize:13, fontWeight:800, color:'#10b981', fontFamily:'Sora', flexShrink:0 }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* City distribution */}
              <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>🗺️ Top Cities (Paid)</div>
                {(() => {
                  const cityMap: Record<string, number> = {};
                  paid.forEach(r => { const k = r.city ?? 'Unknown'; cityMap[k] = (cityMap[k] ?? 0) + 1; });
                  const sorted = Object.entries(cityMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
                  const max = sorted[0]?.[1] ?? 1;
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {sorted.map(([city, count], i) => (
                        <div key={city} style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                              <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{city}</span>
                              <span style={{ fontSize:11, fontWeight:700, color:'var(--acc)', marginLeft:8 }}>{count}</span>
                            </div>
                            <div style={{ height:5, background:'var(--bd)', borderRadius:3, overflow:'hidden' }}>
                              <div style={{
                                width:`${Math.round(count/max*100)}%`, height:'100%', borderRadius:3,
                                background: `hsl(${220+i*22},70%,60%)`,
                              }}/>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── REPORTING — uses external ReportingPage component ────── */}
          <div className={`page${activePage==='reporting'?' active':''}`}>
            <ReportingPage allRows={allRows} programs={programs} schools={schools} />
          </div>

          {/* ── STUDENTS ────────────────────────────────────────────── */}
          <div className={`page${activePage==='students'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Students <span>Table</span></h1><p>{allRows.length} total records</p></div><div className="topbar-right"><button className="btn btn-primary" onClick={exportCSV}>⬇ Export CSV</button></div></div>
            <StudentsTable rows={allRows} programs={programs} onRowClick={setModal} />
          </div>

          {/* ── TRENDS ──────────────────────────────────────────────── */}
          <div className={`page${activePage==='trends'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Trends <span>Analysis</span></h1></div></div>
            <div className="charts-grid">
              <div className="chart-card wide"><div className="chart-header"><div><div className="chart-title">📈 30-Day Trend</div></div></div><div className="chart-wrap tall"><canvas id="chartTrend"/></div></div>
            </div>
          </div>

          {/* ── FOLLOW-UP ───────────────────────────────────────────── */}
          <div className={`page${activePage==='followup'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Follow-Up <span>Tracker</span></h1><p>{followUpCount} need follow-up</p></div></div>
            <FollowUpList rows={allRows.filter(r=>['pending','failed','cancelled','initiated'].includes(r.payment_status))} onRowClick={setModal} />
          </div>

          {/* ── HEATMAP ─────────────────────────────────────────────── */}
          <div className={`page${activePage==='heatmap'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>City <span>Heatmap</span></h1></div></div>
            <CityHeatmap rows={allRows} />
          </div>

          {/* ── RECENT ──────────────────────────────────────────────── */}
          <div className={`page${activePage==='recent'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Recent <span>Activity</span></h1><p>Student payments + school registrations</p></div>
              <div className="topbar-right">
                <button className="btn btn-outline" onClick={()=>{ api('/api/admin/activity-logs?limit=200').then((d:any)=>setActivityLogs(d.logs??[])).catch(()=>{}); }}>🔄 Refresh</button>
              </div>
            </div>
            <UnifiedTimeline paymentRows={allRows.slice(0,100)} activityLogs={activityLogs} onRowClick={setModal} />
          </div>

          {/* ── PROGRAMS ────────────────────────────────────────────── */}
          <div className={`page${activePage==='programs'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Programs <span>Management</span></h1><p>Define base programs with URLs and pricing</p></div>
              <div className="topbar-right">{isSuperAdmin&&<button className="btn btn-primary" onClick={()=>setProgramForm({})}>+ Add Program</button>}</div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Program Name</th><th>Slug</th><th>Base Price INR (₹)</th><th>Base Price USD ($)</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {programs.length===0
                  ? <tr><td colSpan={6} className="table-empty">No programs yet.</td></tr>
                  : programs.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:700}}>{p.name}</td>
                      <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12}}>{p.slug}</code></td>
                      <td><span className="amt">₹{fmtR(p.base_amount_inr ?? p.base_amount ?? 0)}</span></td>
                      <td><span className="amt" style={{color:'#22c55e'}}>{p.base_amount_usd ? `$${fmtR(p.base_amount_usd)}` : <span style={{color:'var(--m)',fontWeight:400}}>—</span>}</span></td>
                      <td><span className={`badge ${p.status==='active'?'badge-paid':'badge-cancelled'}`}>{p.status}</span></td>
                      <td><button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setProgramForm(p)}>Edit</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table></div>
          </div>

          {/* ── SCHOOLS ─────────────────────────────────────────────── */}
          <div className={`page${activePage==='schools'?' active':''}`}>
            <SchoolsPageWithApproval
              schools={schools}
              programs={programs}
              isSuperAdmin={isSuperAdmin}
              BACKEND={BACKEND}
              authHeaders={authHeaders}
              onEdit={s => { loadPrograms(); setSchoolForm(s); }}
              onRefresh={loadSchools}
              showToast={(t, i) => showToast(t, i ?? '')}
            />
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
                        <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Delete code ${d.code}?`))return;await fetch(`${BACKEND}/api/admin/discounts`,{credentials:'include',method:'DELETE',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:d.id})});loadDiscounts();}}>Delete</button>
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
            <div style={{background:'var(--acc3)',border:'1.5px solid rgba(79,70,229,.2)',borderRadius:12,padding:'14px 18px',marginBottom:20,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
              <div style={{fontSize:22}}>🏫</div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:700,fontSize:13,color:'var(--acc)',marginBottom:3}}>School Admin Portal URL</div>
                <div style={{fontSize:11,color:'var(--m)',marginBottom:6}}>Share this link with school admins so they can log in to their dashboard.</div>
                <code style={{fontFamily:'monospace',fontSize:12,color:'var(--text)',background:'var(--bg)',padding:'6px 10px',borderRadius:7,display:'inline-block',wordBreak:'break-all'}}>
                  {(BACKEND||'https://thynk-registration.vercel.app')}/school/login
                </code>
              </div>
              <button onClick={()=>{navigator.clipboard.writeText(`${BACKEND||'https://thynk-registration.vercel.app'}/school/login`);showToast('School portal URL copied!','✅');}} style={{padding:'8px 16px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0}}>📋 Copy URL</button>
              <a href="/school/login" target="_blank" rel="noreferrer" style={{padding:'8px 14px',borderRadius:9,border:'1.5px solid var(--acc)',color:'var(--acc)',fontSize:12,fontWeight:700,textDecoration:'none',flexShrink:0}}>↗ Open Portal</a>
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
                      {isSuperAdmin&&<td><button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm(`Remove ${u.email}?`))return;await fetch(`${BACKEND}/api/admin/users`,{credentials:'include',method:'DELETE',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({role_id:u.id})});loadUsers();}}>Remove</button></td>}
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
            <SectionTitle>💳 Payment Gateways</SectionTitle>
            <div className="int-grid">
              {['razorpay','cashfree','easebuzz','paypal'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (<IntCard key={provider} provider={provider} cfg={cfg} onEdit={()=>setIntegrationForm(cfg??{provider})} onToggle={async()=>{ if(!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`,{credentials:'include',method:'PATCH',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})}); loadIntegrations(); }} />);
              })}
            </div>
            <SectionTitle>✉️ Email Providers</SectionTitle>
            <div className="int-grid">
              {['smtp','sendgrid','aws_ses'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (<IntCard key={provider} provider={provider} cfg={cfg} onEdit={()=>setIntegrationForm(cfg??{provider})} onToggle={async()=>{ if(!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`,{credentials:'include',method:'PATCH',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})}); loadIntegrations(); }} />);
              })}
            </div>
            <SectionTitle>💬 WhatsApp Providers</SectionTitle>
            <div className="int-grid">
              {['whatsapp_cloud','twilio'].map(provider => {
                const cfg = integrations.find(i=>i.provider===provider);
                return (<IntCard key={provider} provider={provider} cfg={cfg} onEdit={()=>setIntegrationForm(cfg??{provider})} onToggle={async()=>{ if(!cfg) return; await fetch(`${BACKEND}/api/admin/integrations`,{credentials:'include',method:'PATCH',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active})}); loadIntegrations(); }} />);
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
                {triggers.length===0 ? <tr><td colSpan={6} className="table-empty">No triggers yet.</td></tr>
                : triggers.map(t=>(
                  <tr key={t.id}>
                    <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontSize:12}}>{t.event_type}</code></td>
                    <td><span className="gw-tag">{t.channel}</span></td>
                    <td style={{fontSize:12}}>{t.notification_templates?.name??'—'}</td>
                    <td style={{fontSize:12,color:'var(--m)'}}>{t.school_id??'All Schools'}</td>
                    <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Inactive'}</span></td>
                    <td style={{display:'flex',gap:6}}>
                      <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTriggerForm(t)}>Edit</button>
                      <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete trigger?'))return;await fetch(`${BACKEND}/api/admin/triggers`,{credentials:'include',method:'DELETE',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:t.id})});loadTriggers();}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* ── LOGS: SCHOOLS ─────────────────────────────────────────── */}
          <div className={`page${activePage==='logs_schools'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>School <span>Logs</span></h1><p>Activity, registrations, email & WhatsApp logs per school</p></div></div>
            {activePage==='logs_schools' && (
              <div style={{padding:'0 0 24px'}}>
                <div style={{marginBottom:16}}>
                  <select style={{padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',fontSize:13,minWidth:280}} value={logSelectedSchool?.id??''} onChange={e=>setLogSelectedSchool(schools.find(s=>s.id===e.target.value)??null)}>
                    <option value="">— Select a school —</option>
                    {schools.map(s=><option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>)}
                  </select>
                </div>
                {logSelectedSchool ? <SchoolLogPanel schoolId={logSelectedSchool.id} schoolCode={logSelectedSchool.school_code} authHeaders={authHeaders} BACKEND={BACKEND} /> : <div style={{padding:'40px 0',textAlign:'center',color:'var(--m)',fontSize:14}}>Select a school above to view its logs.</div>}
              </div>
            )}
          </div>

          {/* ── LOGS: STUDENTS ────────────────────────────────────────── */}
          <div className={`page${activePage==='logs_students'?' active':''}`}>
            <div className="topbar"><div className="topbar-left"><h1>Student <span>Logs</span></h1><p>Email & WhatsApp notification logs per student registration</p></div></div>
            {activePage==='logs_students' && (
              <div style={{padding:'0 0 24px'}}>
                <div style={{marginBottom:16}}>
                  <select style={{padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',fontSize:13,minWidth:340}} value={logSelectedStudent?.id??''} onChange={e=>setLogSelectedStudent(logAllStudents.find(s=>s.id===e.target.value)??null)}>
                    <option value="">— Select a student —</option>
                    {logAllStudents.map(s=><option key={s.id} value={s.id}>{s.student_name} · {s.parent_email||s.parent_phone||''} ({s.school_code||''})</option>)}
                  </select>
                </div>
                {logSelectedStudent ? <StudentLogPanel registrationId={logSelectedStudent.id} studentEmail={logSelectedStudent.parent_email??''} studentPhone={logSelectedStudent.parent_phone??''} authHeaders={authHeaders} BACKEND={BACKEND} /> : <div style={{padding:'40px 0',textAlign:'center',color:'var(--m)',fontSize:14}}>Select a student above to view notification logs.</div>}
              </div>
            )}
          </div>

          {/* ── LOGS: EMAIL ───────────────────────────────────────────── */}
          <div className={`page${activePage==='logs_email'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Email <span>Trigger Logs</span></h1><p>All outbound email notifications (latest 200)</p></div>
              <div className="topbar-right"><button className="btn btn-outline" onClick={()=>{setLogEmailLoading(true);api('/api/admin/notification-logs?channel=email&limit=200').then((d:any)=>{setLogEmailRows(d.logs??[]);setLogEmailLoading(false);}).catch(()=>setLogEmailLoading(false));}}>🔄 Refresh</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Time</th><th>Event</th><th>Recipient</th><th>School</th><th>Student</th><th>Status</th></tr></thead>
              <tbody>
                {logEmailLoading ? <tr><td colSpan={6} className="table-empty">Loading…</td></tr>
                : logEmailRows.length===0 ? <tr><td colSpan={6} className="table-empty">No email logs found.</td></tr>
                : logEmailRows.map((r,i)=>(
                  <tr key={r.id??i}>
                    <td style={{fontSize:11,color:'var(--m)',whiteSpace:'nowrap'}}>{r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'}</td>
                    <td><code style={{background:'var(--acc3)',color:'var(--acc)',padding:'2px 6px',borderRadius:4,fontSize:11}}>{r.event_type??'—'}</code></td>
                    <td style={{fontSize:12}}>{r.recipient??r.to_email??'—'}</td>
                    <td style={{fontSize:12,color:'var(--m)'}}>{r.school_code??r.schools?.school_code??'—'}</td>
                    <td style={{fontSize:12}}>{r.student_name??'—'}</td>
                    <td><span className={`badge ${r.status==='sent'?'badge-paid':r.status==='failed'?'badge-cancelled':'badge-pending'}`}>{r.status??'—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* ── LOGS: WHATSAPP ────────────────────────────────────────── */}
          <div className={`page${activePage==='logs_whatsapp'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>WhatsApp <span>Trigger Logs</span></h1><p>All outbound WhatsApp notifications (latest 200)</p></div>
              <div className="topbar-right"><button className="btn btn-outline" onClick={()=>{setLogWaLoading(true);api('/api/admin/notification-logs?channel=whatsapp&limit=200').then((d:any)=>{setLogWaRows(d.logs??[]);setLogWaLoading(false);}).catch(()=>setLogWaLoading(false));}}>🔄 Refresh</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Time</th><th>Event</th><th>Phone</th><th>School</th><th>Student</th><th>Status</th></tr></thead>
              <tbody>
                {logWaLoading ? <tr><td colSpan={6} className="table-empty">Loading…</td></tr>
                : logWaRows.length===0 ? <tr><td colSpan={6} className="table-empty">No WhatsApp logs found.</td></tr>
                : logWaRows.map((r,i)=>(
                  <tr key={r.id??i}>
                    <td style={{fontSize:11,color:'var(--m)',whiteSpace:'nowrap'}}>{r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'}</td>
                    <td><code style={{background:'rgba(37,211,102,0.12)',color:'#25d366',padding:'2px 6px',borderRadius:4,fontSize:11}}>{r.event_type??'—'}</code></td>
                    <td style={{fontSize:12}}>{r.recipient??r.to_phone??'—'}</td>
                    <td style={{fontSize:12,color:'var(--m)'}}>{r.school_code??r.schools?.school_code??'—'}</td>
                    <td style={{fontSize:12}}>{r.student_name??'—'}</td>
                    <td><span className={`badge ${r.status==='sent'?'badge-paid':r.status==='failed'?'badge-cancelled':'badge-pending'}`}>{r.status??'—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* ── TEMPLATES ────────────────────────────────────────────── */}
          <div className={`page${activePage==='templates'?' active':''}`}>
            <div className="topbar">
              <div className="topbar-left"><h1>Message <span>Templates</span></h1><p>Email & WhatsApp message drafts</p></div>
              <div className="topbar-right"><button className="btn btn-primary" onClick={()=>setTemplateForm({})}>+ New Template</button></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Name</th><th>Channel</th><th>Subject</th><th>Preview</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {templates.length===0 ? <tr><td colSpan={6} className="table-empty">No templates yet.</td></tr>
                : templates.map(t=>(
                  <tr key={t.id}>
                    <td style={{fontWeight:700}}>{t.name}</td>
                    <td><span className="gw-tag">{t.channel}</span></td>
                    <td style={{fontSize:12}}>{t.subject??'—'}</td>
                    <td style={{fontSize:11,color:'var(--m)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.body?.slice(0,80)}…</td>
                    <td><span className={`badge ${t.is_active?'badge-paid':'badge-cancelled'}`}>{t.is_active?'Active':'Inactive'}</span></td>
                    <td style={{display:'flex',gap:6}}>
                      <button className="btn btn-outline" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setTemplateForm(t)}>Edit</button>
                      <button className="btn" style={{fontSize:11,padding:'4px 10px',background:'var(--red2)',color:'var(--red)',border:'none'}} onClick={async()=>{if(!confirm('Delete template?'))return;await fetch(`${BACKEND}/api/admin/templates`,{credentials:'include',method:'DELETE',headers:{...{'Content-Type':'application/json'},...(accessTokenRef.current?{'Authorization':`Bearer ${accessTokenRef.current}`}:{})},body:JSON.stringify({id:t.id})});loadTemplates();}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* ── LOCATION MASTER ──────────────────────────────────────── */}
          <div className={`page${activePage==='locations'?' active':''}`}>
            <LocationMasterPage rows={locations} BACKEND={BACKEND} onReload={loadLocations} showToast={showToast} />
          </div>

        </main>
      </div>

      {/* ── Student detail modal ──────────────────────────────────── */}
      {modal && (
        <StudentDetailModal
          student={modal}
          onClose={() => setModal(null)}
          showToast={showToast}
          fmtR={fmtR}
        />
      )}

      {/* ── Drill-down modal ──────────────────────────────────────── */}
      {drillData&&(
        <div className="drill-overlay show" onClick={e=>{if(e.target===e.currentTarget)setDrillData(null);}}>
          <div className="drill-modal">
            <div className="drill-head"><div><h3>{drillData.title}</h3><span className="drill-count">({drillData.rows.length})</span></div><button className="drill-close" onClick={()=>setDrillData(null)}>✕</button></div>
            <div className="drill-body">
              {drillData.rows.map((r,i)=>(
                <div key={r.id} className="drill-row" onClick={()=>{setDrillData(null);setTimeout(()=>setModal(r),200);}}>
                  <div className="drill-num">{i+1}</div>
                  <div style={{flex:1}}><div className="drill-name">{r.student_name} <span className={`badge badge-${r.payment_status}`} style={{fontSize:10}}>{r.payment_status}</span></div><div className="drill-meta">{r.class_grade} · {r.school_name??r.parent_school} · {r.city}</div></div>
                  <div style={{textAlign:'right'}}><div className="drill-amt">{fmtAmt(r.final_amount??0, r.country)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {programForm!==null&&<ProgramFormModal initial={programForm} onClose={()=>setProgramForm(null)} onSave={async(data)=>{await saveForm('/api/admin/projects',data,()=>{setProgramForm(null);loadPrograms();},data.id?'Program updated!':'Program created!');}} />}
      {schoolForm!==null&&<SchoolFormModal initial={schoolForm} programs={programs} onClose={()=>setSchoolForm(null)} onSave={async(data)=>{await saveForm('/api/admin/schools',data,()=>{setSchoolForm(null);setSchools([]);loadSchools();},data.id?'School updated!':'School created!');}} />}
      {discountForm!==null&&<DiscountFormModal initial={discountForm} schools={schools} onClose={()=>setDiscountForm(null)} onSave={async(data)=>{await saveForm('/api/admin/discounts',data,()=>{setDiscountForm(null);loadDiscounts();},data.id?'Code updated!':'Code created!');}} />}
      {userForm!==null&&<UserFormModal schools={schools} onClose={()=>setUserForm(null)} onSave={async(data)=>{await saveForm('/api/admin/users',data,()=>{setUserForm(null);loadUsers();},'Admin user created!');}} />}
      {integrationForm!==null&&<IntegrationFormModal initial={integrationForm} schools={schools} onClose={()=>setIntegrationForm(null)} onSave={async(data)=>{await saveForm('/api/admin/integrations',data,()=>{setIntegrationForm(null);loadIntegrations();},data.id?'Integration updated!':'Integration saved!');}} />}
      {triggerForm!==null&&<TriggerFormModal initial={triggerForm} schools={schools} templates={templates} onClose={()=>setTriggerForm(null)} onSave={async(data)=>{await saveForm('/api/admin/triggers',data,()=>{setTriggerForm(null);loadTriggers();},data.id?'Trigger updated!':'Trigger created!');}} />}
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
    id: initial.id??'', name: initial.name??'', slug: initial.slug??'',
    base_amount_inr: initial.base_amount_inr ? String(initial.base_amount_inr/100) : '',
    base_amount_usd: initial.base_amount_usd ? String(initial.base_amount_usd/100) : '',
    status: initial.status??'active',
    allowed_grades: (initial.allowed_grades ?? []) as string[],
  });
  const [allGrades, setAllGrades] = useState<Row[]>([]);
  const [gradesLoading, setGradesLoading] = useState(true);
  useEffect(() => {
    fetch(`${BACKEND}/api/admin/grades?active=true`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setAllGrades(d.grades ?? []); setGradesLoading(false); }).catch(() => setGradesLoading(false));
  }, []);
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setF(p=>({...p,[k]:e.target.value}));
  const autoSlug = (name:string) => name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  function toggleGrade(gradeName: string) { setF(p => { const already = p.allowed_grades.includes(gradeName); return { ...p, allowed_grades: already ? p.allowed_grades.filter(g => g !== gradeName) : [...p.allowed_grades, gradeName] }; }); }
  function selectAll()  { setF(p => ({ ...p, allowed_grades: allGrades.map(g => g.name) })); }
  function selectNone() { setF(p => ({ ...p, allowed_grades: [] })); }
  return (
    <ModalShell title={f.id?'Edit Program':'New Program'} onClose={onClose}>
      <Field label="Program Name *"><input style={IS} value={f.name} onChange={e=>{setF(p=>({...p,name:e.target.value,slug:p.slug||autoSlug(e.target.value)}));}} placeholder="e.g. Thynk Success 2025"/></Field>
      <Field label="Slug * (used in URL)"><input style={IS} value={f.slug} onChange={set('slug')} placeholder="thynk-success-2025" disabled={!!f.id}/></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Base Price — INR (₹) *"><div style={{position:'relative'}}><span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontWeight:700,color:'var(--m)',fontSize:14,pointerEvents:'none'}}>₹</span><input style={{...IS,paddingLeft:26}} type="number" value={f.base_amount_inr} onChange={set('base_amount_inr')} placeholder="e.g. 1200"/></div></Field>
        <Field label="Base Price — USD ($) (optional)"><div style={{position:'relative'}}><span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontWeight:700,color:'var(--m)',fontSize:14,pointerEvents:'none'}}>$</span><input style={{...IS,paddingLeft:26}} type="number" value={f.base_amount_usd} onChange={set('base_amount_usd')} placeholder="e.g. 50"/></div></Field>
        <Field label="Status"><select style={SS} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </div>
      <div style={{marginTop:18,marginBottom:4}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--m)',textTransform:'uppercase',letterSpacing:'.04em'}}>Allowed Grades *</label>
          <div style={{display:'flex',gap:8}}>
            <button type="button" onClick={selectAll} style={{padding:'3px 10px',borderRadius:6,border:'1.5px solid var(--acc)',background:'transparent',color:'var(--acc)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>All</button>
            <button type="button" onClick={selectNone} style={{padding:'3px 10px',borderRadius:6,border:'1.5px solid var(--bd)',background:'transparent',color:'var(--m)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>None</button>
          </div>
        </div>
        {gradesLoading ? <div style={{padding:'14px 0',fontSize:12,color:'var(--m)'}}>Loading grades…</div>
        : allGrades.length === 0 ? <div style={{padding:'12px 16px',borderRadius:10,border:'1.5px dashed var(--bd)',fontSize:12,color:'var(--m)',textAlign:'center'}}>No grades configured. Go to Settings → Grade Master first.</div>
        : (<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))',gap:8,padding:'14px 16px',border:'1.5px solid var(--bd)',borderRadius:10,background:'var(--bg)',maxHeight:220,overflowY:'auto'}}>
            {allGrades.map(g => { const checked = f.allowed_grades.includes(g.name); return (<label key={g.id} onClick={() => toggleGrade(g.name)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,border:`1.5px solid ${checked ? 'var(--acc)' : 'var(--bd)'}`,background: checked ? 'var(--acc3)' : 'var(--card)',cursor:'pointer',transition:'all .12s',userSelect:'none'}}><div style={{width:16,height:16,borderRadius:4,border:`2px solid ${checked ? 'var(--acc)' : 'var(--bd)'}`,background: checked ? 'var(--acc)' : 'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{checked && <span style={{color:'#fff',fontSize:10,fontWeight:800,lineHeight:1}}>✓</span>}</div><span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight: checked ? 700 : 500,color: checked ? 'var(--acc)' : 'var(--text)',whiteSpace:'nowrap'}}>{g.name}</span></label>); })}
          </div>)}
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({ id: f.id, name: f.name, slug: f.slug, status: f.status, base_amount_inr: f.base_amount_inr ? Math.round(Number(f.base_amount_inr)*100) : 0, base_amount_usd: f.base_amount_usd ? Math.round(Number(f.base_amount_usd)*100) : null, base_amount: f.base_amount_inr ? Math.round(Number(f.base_amount_inr)*100) : 0, currency: 'INR', allowed_grades: f.allowed_grades })}>{f.id?'Save Changes':'Create Program'}</button>
      </div>
    </ModalShell>
  );
}

// ── Location master data ────────────────────────────────────────────
const LOCATION_DATA: Record<string, { states: Record<string, string[]> }> = {
  India: { states: { 'Andhra Pradesh': ['Visakhapatnam','Vijayawada','Guntur','Nellore','Tirupati'], 'Arunachal Pradesh': ['Itanagar','Naharlagun','Pasighat'], 'Assam': ['Guwahati','Silchar','Dibrugarh','Jorhat'], 'Bihar': ['Patna','Gaya','Bhagalpur','Muzaffarpur','Darbhanga'], 'Chhattisgarh': ['Raipur','Bhilai','Bilaspur','Durg'], 'Delhi': ['New Delhi','Delhi'], 'Goa': ['Panaji','Margao','Vasco da Gama'], 'Gujarat': ['Ahmedabad','Surat','Vadodara','Rajkot','Gandhinagar','Bhavnagar'], 'Haryana': ['Gurugram','Faridabad','Chandigarh','Ambala','Hisar','Karnal'], 'Himachal Pradesh': ['Shimla','Dharamsala','Manali','Solan'], 'Jharkhand': ['Ranchi','Jamshedpur','Dhanbad','Bokaro'], 'Karnataka': ['Bengaluru','Mysuru','Hubli','Mangaluru','Belagavi'], 'Kerala': ['Thiruvananthapuram','Kochi','Kozhikode','Thrissur','Kollam'], 'Madhya Pradesh': ['Bhopal','Indore','Gwalior','Jabalpur','Ujjain'], 'Maharashtra': ['Mumbai','Pune','Nagpur','Nashik','Aurangabad','Thane','Navi Mumbai'], 'Manipur': ['Imphal'], 'Meghalaya': ['Shillong'], 'Mizoram': ['Aizawl'], 'Nagaland': ['Kohima','Dimapur'], 'Odisha': ['Bhubaneswar','Cuttack','Rourkela','Berhampur'], 'Punjab': ['Ludhiana','Amritsar','Jalandhar','Patiala','Chandigarh'], 'Rajasthan': ['Jaipur','Jodhpur','Udaipur','Kota','Ajmer','Bikaner'], 'Sikkim': ['Gangtok'], 'Tamil Nadu': ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli'], 'Telangana': ['Hyderabad','Warangal','Nizamabad','Karimnagar'], 'Tripura': ['Agartala'], 'Uttar Pradesh': ['Lucknow','Kanpur','Agra','Varanasi','Prayagraj','Ghaziabad','Noida','Meerut','Bareilly'], 'Uttarakhand': ['Dehradun','Haridwar','Roorkee','Rishikesh','Nainital'], 'West Bengal': ['Kolkata','Howrah','Durgapur','Asansol','Siliguri'], 'Jammu & Kashmir': ['Srinagar','Jammu'], 'Ladakh': ['Leh','Kargil'], 'Chandigarh': ['Chandigarh'], 'Puducherry': ['Puducherry'], 'Andaman & Nicobar': ['Port Blair'], 'Lakshadweep': ['Kavaratti'], 'Dadra & Nagar Haveli': ['Silvassa'], 'Daman & Diu': ['Daman','Diu'] } },
  'United Arab Emirates': { states: { 'Abu Dhabi': ['Abu Dhabi','Al Ain'], 'Dubai': ['Dubai'], 'Sharjah': ['Sharjah'], 'Ajman': ['Ajman'], 'Fujairah': ['Fujairah'], 'Ras Al Khaimah': ['Ras Al Khaimah'], 'Umm Al Quwain': ['Umm Al Quwain'] } },
  'Saudi Arabia': { states: { 'Riyadh': ['Riyadh'], 'Makkah': ['Jeddah','Mecca','Taif'], 'Madinah': ['Medina'], 'Eastern Province': ['Dammam','Khobar','Dhahran','Jubail'], 'Asir': ['Abha'] } },
  'Kuwait': { states: { 'Kuwait Governorate': ['Kuwait City'], 'Ahmadi': ['Ahmadi'], 'Hawalli': ['Hawalli'], 'Farwaniya': ['Farwaniya'] } },
  'Qatar': { states: { 'Doha': ['Doha'], 'Al Rayyan': ['Al Rayyan'], 'Al Wakrah': ['Al Wakrah'], 'Al Khor': ['Al Khor'] } },
  'Bahrain': { states: { 'Capital': ['Manama'], 'Muharraq': ['Muharraq'], 'Northern': ['Hamad Town'], 'Southern': ['Riffa'] } },
  'Oman': { states: { 'Muscat': ['Muscat','Seeb'], 'Dhofar': ['Salalah'], 'Batinah': ['Sohar'], 'Sharqiyah': ['Sur'] } },
  'Singapore': { states: { 'Central Region': ['Singapore'] } },
  'Malaysia': { states: { 'Kuala Lumpur': ['Kuala Lumpur'], 'Selangor': ['Shah Alam','Petaling Jaya','Klang'], 'Penang': ['George Town'], 'Johor': ['Johor Bahru'], 'Sabah': ['Kota Kinabalu'], 'Sarawak': ['Kuching'] } },
  'Other': { states: { 'Other': [] } },
};
const isIndianCountry = (c: string) => c === 'India';

// ── School Form ─────────────────────────────────────────────────────
const EMPTY_CONTACT = { name:'', designation:'', email:'', mobile:'' };

function SchoolFormModal({ initial, programs, onClose, onSave }:{ initial:Row; programs:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const initContacts = (() => { if (Array.isArray(initial.contact_persons) && initial.contact_persons.length) return initial.contact_persons; return [{ ...EMPTY_CONTACT }]; })();
  const [f,setF] = useState({ id:initial.id??'', school_code:initial.school_code??'', name:initial.name??'', org_name:initial.org_name??'', address:initial.address??'', pin_code:initial.pin_code??'', country:initial.country||'India', state:initial.state??'', city:initial.city??'', project_id:initial.project_id??'', school_price:initial.pricing?.[0]?.base_amount ? String(initial.pricing[0].base_amount/100) : '', currency:initial.pricing?.[0]?.currency ?? (isIndianCountry(initial.country||'India') ? 'INR' : 'USD'), discount_code:initial.discount_code ?? initial.school_code?.toUpperCase() ?? '', primary_color:initial.branding?.primaryColor??'#4f46e5', accent_color:initial.branding?.accentColor??'#8b5cf6', is_active:initial.is_active!==false, is_registration_active:initial.is_registration_active!==false });
  const [contacts, setContacts] = useState<{name:string;designation:string;email:string;mobile:string}[]>(initContacts);
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { const val = e.target.type==='checkbox' ? (e.target as HTMLInputElement).checked : e.target.value; setF(p => { const updated = {...p, [k]: val}; if (k === 'country') { updated.currency = isIndianCountry(val as string) ? 'INR' : 'USD'; updated.state = ''; updated.city = ''; } if (k === 'state') updated.city = ''; if (k === 'school_code' && !p.id) { updated.discount_code = (val as string).toUpperCase(); } return updated; }); };
  const setContact = (idx:number, field:string) => (e:React.ChangeEvent<HTMLInputElement>) => { setContacts(prev => prev.map((c,i) => i===idx ? {...c,[field]:e.target.value} : c)); };
  const addContact = () => { if (contacts.length < 4) setContacts(p=>[...p,{...EMPTY_CONTACT}]); };
  const removeContact = (idx:number) => { if (contacts.length > 1) setContacts(p=>p.filter((_,i)=>i!==idx)); };
  const selProgram = programs.find(p=>p.id===f.project_id);
  const countryData = LOCATION_DATA[f.country] ?? LOCATION_DATA['Other'];
  const stateList = Object.keys(countryData.states);
  const cityList = f.state ? (countryData.states[f.state] ?? []) : [];
  const regUrl = selProgram ? `${selProgram.base_url || 'https://www.thynksuccess.com'}/registration/${selProgram.slug}/?school=${f.school_code||'[schoolcode]'}` : '';
  const basePriceDisplay = (() => { if (!selProgram) return null; if (isIndianCountry(f.country)) { const inr = selProgram.base_amount_inr ?? (selProgram.currency==='INR' ? selProgram.base_amount : null); return inr ? { label:`₹${fmtR(inr)}`, raw: String(inr/100) } : null; } else { const usd = selProgram.base_amount_usd ?? (selProgram.currency==='USD' ? selProgram.base_amount : null); return usd ? { label:`$${fmtR(usd)}`, raw: String(usd/100) } : null; } })();
  useEffect(() => { if (basePriceDisplay?.raw && !f.id) { setF(p => ({...p, school_price: basePriceDisplay.raw})); } }, [f.project_id, f.country]);
  return (
    <ModalShell title={f.id?'Edit School':'Add New School'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="School Code *"><input style={{...IS,fontFamily:'monospace'}} value={f.school_code} onChange={set('school_code')} placeholder="e.g. delhi-dps" disabled={!!f.id}/></Field>
        <Field label="School Name *"><input style={IS} value={f.name} onChange={set('name')} placeholder="Delhi Public School"/></Field>
        <Field label="Organisation Name *"><input style={IS} value={f.org_name} onChange={set('org_name')} placeholder="Thynk Success"/></Field>
      </div>
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>🏠 Address</div>
        <Field label="Complete Address *"><textarea style={{...IS,height:64,resize:'vertical'}} value={f.address} onChange={set('address')} placeholder="Enter full street address…"/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'0 12px'}}>
          <Field label="Pin Code *"><input style={IS} value={f.pin_code} onChange={set('pin_code')} placeholder="110001"/></Field>
          <Field label="Country *"><select style={SS} value={f.country} onChange={set('country')}>{Object.keys(LOCATION_DATA).map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="State *"><select style={SS} value={f.state} onChange={set('state')} disabled={stateList.length===0}><option value="">Select State</option>{stateList.map(s=><option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label="City *">{cityList.length > 0 ? <select style={SS} value={f.city} onChange={set('city')}><option value="">Select City</option>{cityList.map(c=><option key={c} value={c}>{c}</option>)}</select> : <input style={IS} value={f.city} onChange={set('city')} placeholder="Enter city"/>}</Field>
        </div>
      </div>
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase'}}>👤 Contact Persons</div>
          {contacts.length < 4 && <button onClick={addContact} style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:600,cursor:'pointer'}}>+ Add Contact</button>}
        </div>
        {contacts.map((c,idx)=>(
          <div key={idx} style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:8,padding:'10px 12px',marginBottom:idx<contacts.length-1?10:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--m)'}}>Contact {idx+1}</span>
              {contacts.length > 1 && <button onClick={()=>removeContact(idx)} style={{background:'none',border:'none',color:'var(--red,#ef4444)',cursor:'pointer',fontSize:13,lineHeight:1}}>✕</button>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
              <Field label="Name *"><input style={IS} value={c.name} onChange={setContact(idx,'name')} placeholder="Full Name"/></Field>
              <Field label="Designation *"><input style={IS} value={c.designation} onChange={setContact(idx,'designation')} placeholder="Principal / Coordinator"/></Field>
              <Field label="Email *"><input style={IS} type="email" value={c.email} onChange={setContact(idx,'email')} placeholder="contact@school.edu"/></Field>
              <Field label="Mobile *"><input style={IS} type="tel" value={c.mobile} onChange={setContact(idx,'mobile')} placeholder="+91 98765 43210"/></Field>
            </div>
          </div>
        ))}
      </div>
      <Field label="Program *"><select style={SS} value={f.project_id} onChange={set('project_id')}><option value="">Select a program</option>{programs.filter(p=>p.status==='active').map(p=>{ const inr = p.base_amount_inr ?? (p.currency==='INR'?p.base_amount:null); const usd = p.base_amount_usd ?? (p.currency==='USD'?p.base_amount:null); return <option key={p.id} value={p.id}>{p.name} — {inr?`₹${(inr/100).toLocaleString('en-IN')}`:'—'} / {usd?`$${(usd/100).toLocaleString()}`:'—'}</option>; })}</select></Field>
      <Field label="Registration Link"><input style={{...IS,fontFamily:'monospace',fontSize:11,color:'var(--acc)',background:'var(--acc3)'}} value={regUrl || '(select a program and enter school code)'} readOnly onClick={e=>(e.target as HTMLInputElement).select()}/></Field>
      <div style={{background:'var(--bg2,rgba(255,255,255,0.03))',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--m)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>💰 Pricing</div>
        {basePriceDisplay && <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,background:'var(--acc3)',borderRadius:8,padding:'8px 12px'}}><span style={{fontSize:12,color:'var(--m)',fontWeight:600}}>Program Base Price:</span><span style={{fontSize:15,fontWeight:800,fontFamily:'Sora',color:'var(--acc)'}}>{basePriceDisplay.label}</span></div>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label={`School Pricing (${f.currency}) *`}><input style={IS} type="number" value={f.school_price} onChange={set('school_price')} placeholder={basePriceDisplay ? `Base: ${basePriceDisplay.label}` : 'Enter amount'}/></Field>
          <Field label="Currency"><select style={SS} value={f.currency} onChange={set('currency')}><option value="INR">INR (₹) — India</option><option value="USD">USD ($) — International</option></select></Field>
        </div>
      </div>
      <div style={{background:'var(--orange2,rgba(245,158,11,0.08))',border:'1px solid rgba(245,158,11,0.2)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--orange,#f59e0b)',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>🏷️ Discount Code</div>
        <Field label="Discount Code"><input style={{...IS,textTransform:'uppercase',fontFamily:'monospace',fontWeight:700}} value={f.discount_code} onChange={e=>setF(p=>({...p,discount_code:e.target.value.toUpperCase()}))} placeholder="e.g. DELHI-DPS"/></Field>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="Primary Colour"><input style={{...IS,height:40}} type="color" value={f.primary_color} onChange={set('primary_color')}/></Field>
        <Field label="Accent Colour"><input style={{...IS,height:40}} type="color" value={f.accent_color} onChange={set('accent_color')}/></Field>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14,padding:'12px 14px',background:'var(--bg)',border:'1.5px solid var(--bd)',borderRadius:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" id="is_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto',accentColor:'var(--acc)'}}/><label htmlFor="is_active" style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>School is Active</label></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" id="is_registration_active" checked={f.is_registration_active} onChange={set('is_registration_active')} style={{width:'auto',accentColor:'#10b981'}}/><label htmlFor="is_registration_active" style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Registration Active</label></div>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>onSave({...f, school_price:Math.round(Number(f.school_price)*100), contact_persons:contacts, address:f.address, pin_code:f.pin_code, is_registration_active:f.is_registration_active})}>{f.id?'Save Changes':'Create School'}</button>
      </div>
    </ModalShell>
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
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(f)}>Create Admin User</button></div>
    </ModalShell>
  );
}

// ── Integration Form ────────────────────────────────────────────────
const INT_FIELDS:Record<string,{label:string;key:string;type?:string}[]> = {
  razorpay:[{label:'Key ID',key:'rzp_key_id'},{label:'Key Secret',key:'rzp_key_secret',type:'password'},{label:'Webhook Secret',key:'rzp_webhook_secret',type:'password'}],
  cashfree:[{label:'App ID',key:'cf_app_id'},{label:'Secret Key',key:'cf_secret',type:'password'},{label:'Mode',key:'cf_mode'}],
  easebuzz:[{label:'Key',key:'eb_key'},{label:'Salt',key:'eb_salt',type:'password'},{label:'Env (production/test)',key:'eb_env'}],
  paypal:[{label:'Client ID',key:'pp_client_id'},{label:'Client Secret',key:'pp_client_secret',type:'password'},{label:'Mode (live/sandbox)',key:'pp_mode'}],
  smtp:[{label:'Host',key:'host'},{label:'Port',key:'port'},{label:'User',key:'user'},{label:'Password',key:'password',type:'password'},{label:'From Email',key:'from_email'},{label:'From Name',key:'from_name'}],
  sendgrid:[{label:'API Key',key:'api_key',type:'password'},{label:'From Email',key:'from_email'},{label:'From Name',key:'from_name'}],
  aws_ses:[{label:'Region',key:'region'},{label:'Access Key ID',key:'access_key_id'},{label:'Secret Access Key',key:'secret_access_key',type:'password'},{label:'From Email',key:'from_email'}],
  whatsapp_cloud:[{label:'Phone Number ID',key:'phone_number_id'},{label:'Token',key:'token',type:'password'}],
  twilio:[{label:'Account SID',key:'account_sid'},{label:'Auth Token',key:'auth_token',type:'password'},{label:'WhatsApp From Number',key:'whatsapp_from'}],
};

function IntegrationFormModal({ initial, schools, onClose, onSave }:{ initial:Row; schools:Row[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [provider, setProvider] = useState(initial.provider??'razorpay');
  const [config, setConfig]     = useState<Record<string,string>>(initial.config??{});
  const [schoolId, setSchoolId] = useState(initial.school_id??'');
  const [priority, setPriority] = useState(initial.priority??0);
  const fields = INT_FIELDS[provider]??[];
  return (
    <ModalShell title={initial.id?'Edit Integration':'Add Integration'} onClose={onClose}>
      {!initial.id && (<Field label="Provider"><select style={SS} value={provider} onChange={e=>{ setProvider(e.target.value); setConfig({}); }}><optgroup label="Payment Gateways"><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option><option value="easebuzz">Easebuzz</option><option value="paypal">PayPal</option></optgroup><optgroup label="Email"><option value="smtp">SMTP</option><option value="sendgrid">SendGrid</option><option value="aws_ses">AWS SES</option></optgroup><optgroup label="WhatsApp"><option value="whatsapp_cloud">WhatsApp Cloud API</option><option value="twilio">Twilio</option></optgroup></select></Field>)}
      <Field label="School (leave blank for global)"><select style={SS} value={schoolId} onChange={e=>setSchoolId(e.target.value)}><option value="">Global (all schools)</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Priority (lower = higher priority)"><input style={IS} type="number" value={priority} onChange={e=>setPriority(Number(e.target.value))} placeholder="0"/></Field>
      {fields.map(f=>(<Field key={f.key} label={f.label}><input style={IS} type={f.type??'text'} value={config[f.key]??''} onChange={e=>setConfig(p=>({...p,[f.key]:e.target.value}))} placeholder={f.label}/></Field>))}
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave({id:initial.id,provider,school_id:schoolId||null,priority,config,is_active:true})}>{initial.id?'Save Changes':'Save Integration'}</button></div>
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
      <Field label="Event *"><select style={SS} value={f.event_type} onChange={set('event_type')}><option value="registration.created">Registration Created</option><option value="payment.paid">Payment Paid</option><option value="payment.failed">Payment Failed</option><option value="payment.cancelled">Payment Cancelled</option><option value="discount.applied">Discount Applied</option></select></Field>
      <Field label="Channel *"><select style={SS} value={f.channel} onChange={set('channel')}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></Field>
      <Field label="Template *"><select style={SS} value={f.template_id} onChange={set('template_id')}><option value="">Select template</option>{filteredTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field label="School (blank = all schools)"><select style={SS} value={f.school_id} onChange={set('school_id')}><option value="">All Schools</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="t_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="t_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Trigger'}</button></div>
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
      <Field label="Message Body *"><textarea style={{...IS,height:160,resize:'vertical'}} value={f.body} onChange={set('body')} placeholder={f.channel==='email'?`Hi {{student_name}},\n\nYour registration for {{school_name}} is confirmed!\n\nAmount: {{amount}}\nTransaction ID: {{txn_id}}\n\nThank you!`:`Hi {{student_name}}! 🎉\nYour registration for {{school_name}} is confirmed.\nAmount: {{amount}} | Txn: {{txn_id}}`}/></Field>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" id="tm_active" checked={f.is_active} onChange={set('is_active')} style={{width:'auto'}}/><label htmlFor="tm_active" style={{fontSize:13,fontWeight:600}}>Active</label></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Create Template'}</button></div>
    </ModalShell>
  );
}

// ── Location Master ─────────────────────────────────────────────────
const COUNTRY_EMOJI: Record<string,string> = { 'India':'🇮🇳','United Arab Emirates':'🇦🇪','Saudi Arabia':'🇸🇦','Kuwait':'🇰🇼','Qatar':'🇶🇦','Bahrain':'🇧🇭','Oman':'🇴🇲','Singapore':'🇸🇬','Malaysia':'🇲🇾','Indonesia':'🇮🇩','Thailand':'🇹🇭','Philippines':'🇵🇭','Vietnam':'🇻🇳','Myanmar':'🇲🇲','Cambodia':'🇰🇭','Sri Lanka':'🇱🇰','Nepal':'🇳🇵','Bangladesh':'🇧🇩','Pakistan':'🇵🇰' };

function LocationFormModal({ initial, existingCountries, existingStates, onClose, onSave }:{ initial: Row; existingCountries: string[]; existingStates: string[]; onClose:()=>void; onSave:(d:Row)=>void }) {
  const [f,setF] = useState({ id:initial.id??'', country:initial.country??'India', state:initial.state??'', city:initial.city??'', sort_order:initial.sort_order??0 });
  const [addingCountry, setAddingCountry] = useState(false);
  const [newCountry,    setNewCountry]    = useState('');
  const [addingState,   setAddingState]   = useState(false);
  const [newState,      setNewState]      = useState('');
  const allCountries = [...new Set([...existingCountries, f.country].filter(Boolean))].sort((a,b)=>{ if(a==='India') return -1; if(b==='India') return 1; return a.localeCompare(b); });
  const statesForCountry = [...new Set([...existingStates, f.state].filter(Boolean))].sort();
  const handleAddCountry = () => { if (!newCountry.trim()) return; setF(p=>({...p, country: newCountry.trim(), state:''})); setAddingCountry(false); setNewCountry(''); };
  const handleAddState   = () => { if (!newState.trim()) return; setF(p=>({...p, state: newState.trim()})); setAddingState(false); setNewState(''); };
  return (
    <ModalShell title={f.id?'Edit Location':'Add Location'} onClose={onClose}>
      <Field label="Country *">
        {addingCountry ? <div style={{display:'flex',gap:6}}><input style={{...IS,flex:1}} value={newCountry} onChange={e=>setNewCountry(e.target.value)} placeholder="Enter new country name" autoFocus/><button onClick={handleAddCountry} style={{background:'var(--acc)',color:'#fff',border:'none',borderRadius:8,padding:'0 14px',cursor:'pointer',fontWeight:600,fontSize:12}}>Add</button><button onClick={()=>{setAddingCountry(false);setNewCountry('');}} style={{background:'var(--bd)',color:'var(--m)',border:'none',borderRadius:8,padding:'0 10px',cursor:'pointer',fontSize:12}}>✕</button></div>
        : <div style={{display:'flex',gap:6}}><select style={{...SS,flex:1}} value={f.country} onChange={e=>setF(p=>({...p,country:e.target.value,state:''}))}><option value="">Select Country</option>{allCountries.map(c=><option key={c} value={c}>{c}</option>)}</select><button onClick={()=>setAddingCountry(true)} style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:8,padding:'0 12px',cursor:'pointer',fontWeight:700,fontSize:16,lineHeight:1}}>+</button></div>}
      </Field>
      <Field label="State / Region *">
        {addingState ? <div style={{display:'flex',gap:6}}><input style={{...IS,flex:1}} value={newState} onChange={e=>setNewState(e.target.value)} placeholder="Enter new state / region" autoFocus/><button onClick={handleAddState} style={{background:'var(--acc)',color:'#fff',border:'none',borderRadius:8,padding:'0 14px',cursor:'pointer',fontWeight:600,fontSize:12}}>Add</button><button onClick={()=>{setAddingState(false);setNewState('');}} style={{background:'var(--bd)',color:'var(--m)',border:'none',borderRadius:8,padding:'0 10px',cursor:'pointer',fontSize:12}}>✕</button></div>
        : <div style={{display:'flex',gap:6}}><select style={{...SS,flex:1}} value={f.state} onChange={e=>setF(p=>({...p,state:e.target.value}))}><option value="">Select State</option>{statesForCountry.map(s=><option key={s} value={s}>{s}</option>)}</select><button onClick={()=>setAddingState(true)} style={{background:'var(--acc3)',color:'var(--acc)',border:'1px solid var(--acc)',borderRadius:8,padding:'0 12px',cursor:'pointer',fontWeight:700,fontSize:16,lineHeight:1}}>+</button></div>}
      </Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
        <Field label="City (leave blank for state-level entry)"><input style={IS} value={f.city} onChange={e=>setF(p=>({...p,city:e.target.value}))} placeholder="New Delhi"/></Field>
        <Field label="Sort Order"><input style={IS} type="number" value={f.sort_order} onChange={e=>setF(p=>({...p,sort_order:Number(e.target.value)}))} min={0}/></Field>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>onSave(f)}>{f.id?'Save Changes':'Add Location'}</button></div>
    </ModalShell>
  );
}

function LocationMasterPage({ rows, BACKEND, onReload, showToast }:{ rows:Row[]; BACKEND:string; onReload:()=>void; showToast:(t:string,i?:string)=>void }) {
  const [activeCountry, setActiveCountry] = useState('');
  const [activeState,   setActiveState]   = useState('');
  const [search,        setSearch]        = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editRow,       setEditRow]       = useState<Row|undefined>();
  const [saving,        setSaving]        = useState(false);
  const countries = [...new Set(rows.map(r=>r.country))].sort((a,b)=>{ if(a==='India') return -1; if(b==='India') return 1; return a.localeCompare(b); });
  React.useEffect(()=>{ if(!activeCountry && countries.length) setActiveCountry(countries[0]); }, [countries.length]);
  const statesInCountry = [...new Set(rows.filter(r=>r.country===activeCountry).map(r=>r.state))].sort();
  React.useEffect(()=>{ setActiveState(''); },[activeCountry]);
  React.useEffect(()=>{ if(!activeState && statesInCountry.length) setActiveState(statesInCountry[0]); },[statesInCountry.length, activeCountry]);
  const citiesInState = rows.filter(r=> r.country===activeCountry && r.state===activeState && (search==='' || r.city?.toLowerCase().includes(search.toLowerCase()) || r.state?.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.city??'').localeCompare(b.city??''));
  const filteredCountries = countries.filter(c=>c.toLowerCase().includes(countrySearch.toLowerCase()));
  const activeCount  = rows.filter(r=>r.is_active).length;
  const countryCount = countries.length;
  const stateCount   = [...new Set(rows.map(r=>r.country+'|'+r.state))].length;
  async function toggleActive(row:Row) { await authFetch(`${BACKEND}/api/admin/location`,{ method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,is_active:!row.is_active}) }); onReload(); }
  async function deleteRow(row:Row) { if(!confirm(`Delete "${row.city||row.state}"?`)) return; await authFetch(`${BACKEND}/api/admin/location`,{ method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id}) }); showToast('Deleted','✅'); onReload(); }
  async function handleSave(d:Row) { setSaving(true); const method = d.id ? 'PATCH' : 'POST'; const res = await authFetch(`${BACKEND}/api/admin/location`,{ method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) }); const json = await res.json(); setSaving(false); if(!res.ok){ showToast(json.error||'Failed','❌'); return; } showToast(d.id?'Updated!':'Added!','✅'); setModalOpen(false); setEditRow(undefined); onReload(); }
  return (
    <>
      <div className="topbar"><div className="topbar-left"><h1>Location <span>Master</span></h1><p>Countries, states & cities used across all school forms</p></div><div className="topbar-right"><button className="btn btn-primary" onClick={()=>{setEditRow(undefined);setModalOpen(true);}}>+ Add Location</button></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        {[{label:'Total Entries',value:rows.length,color:'var(--acc)'},{label:'Active',value:activeCount,color:'#4ADE80'},{label:'Countries',value:countryCount,color:'#f59e0b'},{label:'States/Regions',value:stateCount,color:'var(--m)'}].map(s=>(<div key={s.label} style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}><span style={{fontWeight:800,fontSize:22,color:s.color,fontFamily:'Sora'}}>{s.value}</span><span style={{fontSize:11,color:'var(--m)',fontWeight:500}}>{s.label}</span></div>))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:12,height:'calc(100vh - 300px)',minHeight:0}}>
        <div style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:10,borderBottom:'1px solid var(--bd)'}}><input placeholder="Search countries…" value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} style={{...IS,padding:'8px 12px',fontSize:12}}/></div>
          <div style={{flex:1,overflowY:'auto',padding:6}}>
            {filteredCountries.map(c=>{ const cnt = rows.filter(r=>r.country===c).length; const isActive = c===activeCountry; return (<button key={c} onClick={()=>setActiveCountry(c)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',marginBottom:2,background: isActive?'rgba(79,70,229,0.15)':'transparent',borderLeft: isActive?'3px solid var(--acc)':'3px solid transparent'}}><span style={{fontSize:18,flexShrink:0}}>{COUNTRY_EMOJI[c]??'🌍'}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:isActive?700:500,color:isActive?'var(--acc)':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c}</div><div style={{fontSize:10,color:'var(--m2)'}}>{cnt} entries</div></div></button>); })}
          </div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}><span style={{fontSize:28}}>{COUNTRY_EMOJI[activeCountry]??'🌍'}</span><div style={{flex:1}}><h2 style={{fontFamily:'Sora',fontSize:17,fontWeight:800,margin:0}}>{activeCountry||'Select a country'}</h2><div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{statesInCountry.length} states · {rows.filter(r=>r.country===activeCountry).length} entries</div></div><input placeholder="Search cities…" value={search} onChange={e=>setSearch(e.target.value)} style={{...IS,padding:'7px 12px',fontSize:12,width:180}}/></div>
          <div style={{display:'flex',gap:6,padding:'10px 14px',borderBottom:'1px solid var(--bd)',overflowX:'auto',flexShrink:0,flexWrap:'nowrap'}}>{statesInCountry.map(s=>(<button key={s} onClick={()=>setActiveState(s)} style={{padding:'5px 14px',borderRadius:20,border:'1.5px solid',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap',flexShrink:0,background: s===activeState?'var(--acc)':'transparent',borderColor: s===activeState?'var(--acc)':'var(--bd)',color: s===activeState?'#fff':'var(--m)'}}>{s}<span style={{marginLeft:5,fontSize:10,opacity:0.7}}>({rows.filter(r=>r.country===activeCountry&&r.state===s).length})</span></button>))}</div>
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            {citiesInState.length===0 ? <div style={{textAlign:'center',padding:'48px 0',color:'var(--m2)',fontSize:13}}>{activeState ? `No entries for ${activeState}.` : 'Select a state tab above.'}</div>
            : <div style={{display:'flex',flexDirection:'column',gap:5}}>{citiesInState.map(row=>(<div key={row.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:9,border:'1px solid var(--bd)',opacity: row.is_active?1:0.5}}><span style={{fontFamily:'monospace',fontSize:11,color:'var(--m2)',width:22,textAlign:'center',flexShrink:0}}>{row.sort_order}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14}}>{row.city||<em style={{color:'var(--m)',fontStyle:'normal',fontSize:12}}>(state-level entry)</em>}</div><div style={{fontSize:11,color:'var(--m)',marginTop:1}}>{row.state}</div></div><button onClick={()=>toggleActive(row)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,lineHeight:1,color:row.is_active?'#4ADE80':'rgba(255,255,255,0.2)',flexShrink:0}}>{row.is_active?'●':'○'}</button><button onClick={()=>{setEditRow(row);setModalOpen(true);}} style={{background:'var(--card)',border:'1px solid var(--bd)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,color:'var(--m)',flexShrink:0}}>Edit</button><button onClick={()=>deleteRow(row)} style={{background:'var(--red2,rgba(239,68,68,0.08))',border:'1px solid rgba(239,68,68,0.15)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:11,color:'var(--red,#ef4444)',flexShrink:0}}>Delete</button></div>))}</div>}
          </div>
        </div>
      </div>
      {modalOpen&&(<LocationFormModal initial={editRow ?? {country: activeCountry, state: activeState}} existingCountries={countries} existingStates={statesInCountry} onClose={()=>{setModalOpen(false);setEditRow(undefined);}} onSave={handleSave}/>)}
    </>
  );
}

// ── Students Table ──────────────────────────────────────────────────
function StudentsTable({ rows, programs, onRowClick }:{ rows:Row[]; programs:Row[]; onRowClick:(r:Row)=>void }) {
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [gateway, setGateway] = useState('');
  const [program, setProgram] = useState('');
  const [country, setCountry] = useState('');
  const [state,   setState]   = useState('');
  const [city,    setCity]    = useState('');
  const [school,  setSchool]  = useState('');
  const [cls,     setCls]     = useState('');
  const [gender,  setGender]  = useState('');

  const statuses  = [...new Set(rows.map(r=>r.payment_status).filter(Boolean))];
  const gateways  = [...new Set(rows.map(r=>r.gateway).filter(Boolean))];
  const countries = [...new Set(rows.map(r=>r.country).filter(Boolean))].sort();
  const classes   = [...new Set(rows.map(r=>r.class_grade).filter(Boolean))].sort();
  const statesForCountry = [...new Set(rows.filter(r=>!country||r.country===country).map(r=>r.state).filter(Boolean))].sort();
  const citiesForState   = [...new Set(rows.filter(r=>(!country||r.country===country)&&(!state||r.state===state)).map(r=>r.city).filter(Boolean))].sort();
  const schoolsFiltered  = [...new Set(rows.filter(r=>(!country||r.country===country)&&(!state||r.state===state)&&(!city||r.city===city)).map(r=>r.school_name??r.parent_school).filter(Boolean))].sort();

  const handleCountryChange = (v:string) => { setCountry(v); setState(''); setCity(''); setSchool(''); };
  const handleStateChange   = (v:string) => { setState(v);   setCity(''); setSchool(''); };
  const handleCityChange    = (v:string) => { setCity(v);    setSchool(''); };

  const filtered = rows.filter(r => {
    const hay = [r.student_name,r.parent_name,r.contact_phone,r.contact_email,r.parent_school,r.city,r.gateway_txn_id,r.school_name].join(' ').toLowerCase();
    const schoolName = r.school_name??r.parent_school??'';
    return (
      (!search  || hay.includes(search.toLowerCase())) &&
      (!status  || r.payment_status===status) &&
      (!gateway || r.gateway===gateway) &&
      (!program || r.program_name===program) &&
      (!country || r.country===country) &&
      (!state   || r.state===state) &&
      (!city    || r.city===city) &&
      (!school  || schoolName===school) &&
      (!cls     || r.class_grade===cls) &&
      (!gender  || r.gender===gender)
    );
  });

  return (<>
    <div className="table-toolbar">
      <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select value={status}  onChange={e=>setStatus(e.target.value)}><option value="">All Status</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
      <select value={gateway} onChange={e=>setGateway(e.target.value)}><option value="">All Gateways</option>{gateways.map(g=><option key={g}>{g}</option>)}</select>
      <select value={program} onChange={e=>setProgram(e.target.value)}><option value="">All Programs</option>{programs.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select>
      <select value={country} onChange={e=>handleCountryChange(e.target.value)}><option value="">All Countries</option>{countries.map(c=><option key={c}>{c}</option>)}</select>
      <select value={state}   onChange={e=>handleStateChange(e.target.value)}><option value="">All States</option>{statesForCountry.map(s=><option key={s}>{s}</option>)}</select>
      <select value={city}    onChange={e=>handleCityChange(e.target.value)}><option value="">All Cities</option>{citiesForState.map(c=><option key={c}>{c}</option>)}</select>
      <select value={school}  onChange={e=>setSchool(e.target.value)}><option value="">All Schools</option>{schoolsFiltered.map(s=><option key={s}>{s}</option>)}</select>
      <select value={cls}     onChange={e=>setCls(e.target.value)}><option value="">All Classes</option>{classes.map(c=><option key={c}>{c}</option>)}</select>
      <select value={gender}  onChange={e=>setGender(e.target.value)}><option value="">All Gender</option>{['Male','Female','Other'].map(g=><option key={g}>{g}</option>)}</select>
      <span style={{fontSize:12,color:'var(--m)',marginLeft:'auto'}}>{filtered.length} of {rows.length}</span>
    </div>
    <div className="tbl-wrap"><table>
      <thead><tr>{['#','Date','Status','Student','Gender','Class','Program','Country','School','City','Parent','Phone','Gateway','Amount','Discount'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={15} className="table-empty">No records found</td></tr>:filtered.map((r,i)=>(
        <tr key={r.id} onClick={()=>onRowClick(r)}>
          <td style={{color:'var(--m2)',fontSize:11}}>{i+1}</td>
          <td style={{color:'var(--m)',fontSize:11}}>{r.created_at?.slice(0,10)}</td>
          <td><span className={`badge badge-${r.payment_status??'pending'}`}>{r.payment_status??'pending'}</span></td>
          <td><div style={{fontWeight:700}}>{r.student_name}</div></td>
          <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:6,fontWeight:600,background:r.gender==='Male'?'#eff6ff':r.gender==='Female'?'#fdf2f8':'var(--bg)',color:r.gender==='Male'?'#2563eb':r.gender==='Female'?'#db2777':'var(--m)'}}>{r.gender??'—'}</span></td>
          <td><span style={{fontSize:11,background:'var(--acc3)',color:'var(--acc)',padding:'2px 8px',borderRadius:6,fontWeight:600}}>{r.class_grade??'—'}</span></td>
          <td><span style={{fontSize:11,background:'rgba(139,92,246,0.1)',color:'#8b5cf6',padding:'2px 8px',borderRadius:6,fontWeight:600,whiteSpace:'nowrap'}}>{r.program_name??'—'}</span></td>
          <td style={{fontSize:12,whiteSpace:'nowrap'}}>{r.country??'—'}</td>
          <td style={{fontSize:12}}>{r.school_name??r.parent_school??'—'}</td>
          <td style={{fontSize:12}}>{r.city??'—'}</td>
          <td style={{fontSize:12}}>{r.parent_name??'—'}</td>
          <td><a href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()} style={{color:'var(--acc)',fontSize:12,textDecoration:'none',fontWeight:600}}>{r.contact_phone}</a></td>
          <td><span className="gw-tag">{r.gateway??'—'}</span></td>
<td><span className="amt">{fmtAmt(r.final_amount??0, r.country)}</span></td>
          <td style={{fontSize:11,color:'var(--red)',fontWeight:600}}>{r.discount_code?`🏷️ ${r.discount_code}`:'—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  </>);
}

function FollowUpList({ rows, onRowClick }:{ rows:Row[]; onRowClick:(r:Row)=>void }) {
  if(!rows.length) return <div className="empty-state"><div className="emoji">🎉</div><p>No pending follow-ups!</p></div>;
  return <div className="followup-card">{rows.map(r=>{const st=r.payment_status??'pending';return(<div key={r.id} className="followup-item" onClick={()=>onRowClick(r)}><div className={`fu-avatar ${st}`}>{(r.student_name??'?')[0].toUpperCase()}</div><div className="fu-info"><div className="fu-name">{r.student_name} <span className={`fu-tag ${st}`}>{r.payment_status}</span></div><div className="fu-meta">{r.class_grade} · {r.school_name??r.parent_school} · {r.city}</div></div><div className="fu-actions"><a className="fu-btn wa" href={`https://wa.me/91${r.contact_phone}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>💬 WA</a><a className="fu-btn call" href={`tel:${r.contact_phone}`} onClick={e=>e.stopPropagation()}>📞 Call</a></div><div style={{textAlign:'right',marginLeft:8}}><div className="amt" style={{fontSize:13}}>{fmtAmt(r.final_amount??0, r.country)}</div><div style={{fontSize:10,color:'var(--m2)'}}>{r.gateway}</div></div></div>);})}</div>;
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

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire UnifiedTimeline function at the bottom of admin/page.tsx
// Also: in the "recent" activePage useEffect, add loadSchools() call AND change
// the activity-logs fetch to include a broader action filter param if your API
// supports it, OR just fetch all logs and filter client-side.
//
// ALSO replace the activePage==='recent' useEffect block with:
//
//   if (activePage === 'recent') {
//     loadSchools();
//     api('/api/admin/activity-logs?limit=500').then((d:any) => setActivityLogs(d.logs ?? [])).catch(() => {});
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Unified Activity Timeline ─────────────────────────────────────────────────
function UnifiedTimeline({
  paymentRows,
  activityLogs,
  onRowClick,
}: {
  paymentRows: Row[];
  activityLogs: Row[];
  onRowClick: (r: Row) => void;
}) {
  const [filter, setFilter] = React.useState<'all' | 'payments' | 'schools'>('all');
  const [search, setSearch] = React.useState('');

  // ── School action config — expanded to cover all known action types ─────
  const ACTION_MAP: Record<string, { icon: string; dot: string; label: string; accent: string }> = {
    'school.self_registered': { icon: '🏫', dot: 'initiated', label: 'School Self-Registered', accent: '#f59e0b' },
    'school.registered':      { icon: '🏫', dot: 'initiated', label: 'School Registered',       accent: '#f59e0b' },
    'school.approved':        { icon: '✅', dot: 'paid',      label: 'School Approved',          accent: '#10b981' },
    'school.rejected':        { icon: '❌', dot: 'failed',    label: 'School Rejected',          accent: '#ef4444' },
    'school.updated':         { icon: '✏️', dot: 'initiated', label: 'School Updated',           accent: '#8b5cf6' },
    'school.deactivated':     { icon: '🚫', dot: 'failed',    label: 'School Deactivated',       accent: '#94a3b8' },
    'school.activated':       { icon: '🟢', dot: 'paid',      label: 'School Activated',         accent: '#10b981' },
    'school.registration_opened':  { icon: '🔓', dot: 'paid', label: 'Registration Opened',  accent: '#06b6d4' },
    'school.registration_closed':  { icon: '🔒', dot: 'failed',label: 'Registration Closed', accent: '#f59e0b' },
    'admin.approved_school':  { icon: '✅', dot: 'paid',      label: 'Admin Approved School',    accent: '#10b981' },
    'admin.rejected_school':  { icon: '❌', dot: 'failed',    label: 'Admin Rejected School',    accent: '#ef4444' },
  };

  // ── Payment events ───────────────────────────────────────────────
  const payEvents = paymentRows.map(r => ({
    id:     `pay-${r.id}`,
    type:   'payment' as const,
    ts:     r.created_at,
    dot:    r.payment_status === 'paid' ? 'paid' : r.payment_status === 'failed' ? 'failed' : 'initiated',
    icon:   r.payment_status === 'paid' ? '✅' : r.payment_status === 'failed' ? '❌' : r.payment_status === 'cancelled' ? '🚫' : '⏳',
    accent: r.payment_status === 'paid' ? '#10b981' : r.payment_status === 'failed' ? '#ef4444' : '#4f46e5',
    title:  r.student_name ?? '—',
    sub:    `${r.class_grade ?? ''} · ${r.school_name ?? r.parent_school ?? ''}`,
    meta:   `${r.gateway ?? '—'} · ${r.city ?? '—'} · ${r.contact_phone ?? ''}`,
    badge:  r.payment_status,
    amount: r.final_amount ?? 0,
    country: r.country,
    raw:    r,
  }));

  // ── School/admin log events — catch ALL school.* AND admin.* actions ──
  const logEvents = activityLogs
    .filter(l => {
      const a = l.action ?? '';
      return a.startsWith('school.') || a.startsWith('admin.') || a.includes('school');
    })
    .map(l => {
      const am = ACTION_MAP[l.action] ?? {
        icon: '📋', dot: 'initiated', label: l.action ?? 'Activity', accent: '#8b5cf6',
      };
      const m = l.metadata ?? {};
      const schoolName = m.name ?? m.school_name ?? l.schools?.name ?? l.school_name ?? '—';
      const metaParts = [m.city, m.country, m.project_name, m.program_name].filter(Boolean);
      return {
        id:      `log-${l.id}`,
        type:    'school' as const,
        ts:      l.created_at,
        dot:     am.dot,
        icon:    am.icon,
        accent:  am.accent,
        title:   schoolName,
        sub:     am.label,
        meta:    metaParts.join(' · ') || (l.schools?.school_code ? `Code: ${l.schools.school_code}` : ''),
        badge:   am.dot === 'paid' ? 'badge-paid' : am.dot === 'failed' ? 'badge-cancelled' : 'badge-initiated',
        amount:  0,
        country: undefined,
        raw:     null as Row | null,
        action:  l.action,
        actor:   l.actor_email ?? l.performed_by ?? '',
      };
    });

  // ── Merge & sort newest-first ────────────────────────────────────
  const all = [...payEvents, ...logEvents].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const filtered = (() => {
    let list = filter === 'payments' ? all.filter(e => e.type === 'payment')
             : filter === 'schools'  ? all.filter(e => e.type === 'school')
             : all;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.sub.toLowerCase().includes(q) ||
        e.meta.toLowerCase().includes(q)
      );
    }
    return list;
  })();

  const schoolCount  = logEvents.length;
  const paidCount    = payEvents.filter(e => e.raw?.payment_status === 'paid').length;
  const approvedCount = logEvents.filter(e => ['school.approved','admin.approved_school'].includes((e as any).action ?? '')).length;
  const pendingApprovalCount = logEvents.filter(e => e.action === 'school.self_registered').length;

  const DOT_STYLE: Record<string, React.CSSProperties> = {
    paid:      { background:'#10b981', boxShadow:'0 0 8px rgba(16,185,129,0.5)' },
    failed:    { background:'#ef4444', boxShadow:'0 0 8px rgba(239,68,68,0.4)' },
    initiated: { background:'#4f46e5', boxShadow:'0 0 8px rgba(79,70,229,0.4)' },
  };

  return (
    <div>
      {/* ── Header stats + filters ───────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        {/* Filter tabs */}
        {([
          ['all',      '🕐 All Activity',             all.length,          'var(--acc)'],
          ['payments', '💳 Payments',                  payEvents.length,    '#10b981'],
          ['schools',  '🏫 School Events',             schoolCount,         '#f59e0b'],
        ] as const).map(([key, label, count, color]) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            style={{
              padding:'8px 16px', borderRadius:10, border:`1.5px solid ${filter===key ? color : 'var(--bd)'}`,
              background: filter===key ? `${color}18` : 'transparent',
              color: filter===key ? color : 'var(--m)',
              fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8,
            }}
          >
            {label}
            <span style={{ background: filter===key ? color : 'var(--bd)', color:'#fff', borderRadius:20, fontSize:10, padding:'1px 7px', fontWeight:800, minWidth:20, textAlign:'center' }}>
              {count}
            </span>
          </button>
        ))}

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search activity…"
          style={{ marginLeft:'auto', border:'1.5px solid var(--bd)', borderRadius:10, padding:'8px 14px', fontSize:12, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', width:220 }}
        />
      </div>

      {/* ── Approval summary strip (shows when there are pending approvals) ── */}
      {pendingApprovalCount > 0 && filter !== 'payments' && (
        <div style={{
          background:'rgba(245,158,11,0.09)', border:'1.5px solid rgba(245,158,11,0.3)',
          borderRadius:12, padding:'12px 18px', marginBottom:16,
          display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
        }}>
          <span style={{ fontSize:22 }}>🏫</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#d97706' }}>
              School Registration Activity
            </div>
            <div style={{ fontSize:11, color:'var(--m)', marginTop:2 }}>
              {pendingApprovalCount} self-registered &nbsp;·&nbsp;
              {approvedCount} approved &nbsp;·&nbsp;
              {logEvents.filter(e => (e as any).action === 'school.rejected' || (e as any).action === 'admin.rejected_school').length} rejected
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--m)' }}>
            {paidCount} paid payments &nbsp;·&nbsp; {filtered.length} total events shown
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'64px 0', color:'var(--m)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{filter === 'schools' ? '🏫' : '📭'}</div>
          <div style={{ fontSize:14, fontWeight:600 }}>
            {search ? 'No results match your search' : filter === 'schools' ? 'No school activity yet' : 'No activity yet'}
          </div>
          <div style={{ fontSize:12, marginTop:6, color:'var(--m2)' }}>
            {filter === 'schools' ? 'School registrations and approvals will appear here' : 'Student payments will appear here'}
          </div>
        </div>
      )}

      {/* ── Timeline list ─────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        {filtered.map((e, idx) => {
          const isSchool = e.type === 'school';
          const dotStyle = DOT_STYLE[e.dot] ?? DOT_STYLE.initiated;

          return (
            <div
              key={e.id}
              style={{
                display:'flex', gap:16, alignItems:'flex-start',
                padding:'14px 0',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--bd)' : 'none',
                cursor: e.raw ? 'pointer' : 'default',
                transition:'background .12s',
              }}
              onClick={() => e.raw && onRowClick(e.raw)}
              onMouseEnter={ev => { if (e.raw) (ev.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
              onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* Timeline dot + line */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, paddingTop:2 }}>
                <div style={{
                  width:36, height:36, borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, flexShrink:0,
                  border:`2px solid ${e.accent}40`,
                  ...dotStyle,
                  boxShadow: 'none',
                  background: `${e.accent}15`,
                }}>
                  {e.icon}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{e.title}</span>
                  {isSchool && (
                    <span style={{
                      fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
                      background:`${e.accent}18`, color:e.accent, border:`1px solid ${e.accent}33`,
                    }}>
                      {e.sub}
                    </span>
                  )}
                  {!isSchool && e.badge && (
                    <span className={`badge badge-${e.badge}`} style={{ fontSize:10 }}>{e.badge}</span>
                  )}
                </div>

                <div style={{ fontSize:12, color:'var(--m)', marginTop:4 }}>
                  {!isSchool ? e.sub : ''}
                  {e.meta && (
                    <span style={{ marginLeft: !isSchool ? 8 : 0, fontSize:11, color:'var(--m2)' }}>
                      {!isSchool ? '·' : ''} {e.meta}
                    </span>
                  )}
                </div>

                {/* Actor for school events */}
                {isSchool && (e as any).actor && (
                  <div style={{ fontSize:10, color:'var(--m2)', marginTop:3 }}>
                    by {(e as any).actor}
                  </div>
                )}
              </div>

              {/* Right: amount / label + time */}
              <div style={{ textAlign:'right', flexShrink:0 }}>
                {e.amount > 0 && (
                  <div style={{ fontSize:15, fontWeight:800, color:'#f59e0b', fontFamily:'Sora,sans-serif' }}>
                    {fmtAmt(e.amount, e.country)}
                  </div>
                )}
                {isSchool && (
                  <div style={{ fontSize:11, fontWeight:700, color:e.accent }}>
                    School Event
                  </div>
                )}
                <div style={{ fontSize:11, color:'var(--m)', marginTop:4 }}>
                  {new Date(e.ts).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                </div>
                <div style={{ fontSize:10, color:'var(--m2)' }}>
                  {new Date(e.ts).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
