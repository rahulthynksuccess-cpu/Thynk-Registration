'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;
const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p / 100);
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

/* ─── Chart.js — load ONCE, globally ────────────────────────────────────────
 *
 * ROOT CAUSE OF THE FREEZE (fixed here permanently):
 *
 * The old useChartJs(cb, deps) hook appended a new <script> tag every time
 * deps changed (tab or data).  If Chart.js was already on window it called
 * cb() fine — but if the script hadn't finished loading yet it attached
 * s.onload = cb, meaning the callback fired multiple times on the same
 * canvas.  Multiple Chart instances on one canvas corrupt the WebGL/2D
 * context; the browser then blocks all pointer events on the page → freeze.
 *
 * FIX — two separate concerns, never mixed again:
 *   1. useChartJsLoader()  — loads the script exactly once, sets chartJsReady.
 *   2. useChartEffect()    — runs chart-drawing code only when BOTH
 *                            chartJsReady===true AND deps actually changed.
 *
 * No matter what else changes in this file, charts can never double-init.
 * ─────────────────────────────────────────────────────────────────────────── */

const CHARTJS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
const SCRIPT_ID   = '__chartjs_singleton__';

/** Load Chart.js exactly once across the lifetime of the page. */
function useChartJsLoader(): boolean {
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    if ((window as any).Chart) { setReady(true); return; }
    // Prevent duplicate script tags if hook mounts twice (React strict mode)
    if (document.getElementById(SCRIPT_ID)) {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
      const handler = () => setReady(true);
      existing.addEventListener('load', handler, { once: true });
      return () => existing.removeEventListener('load', handler);
    }
    const s   = document.createElement('script');
    s.id      = SCRIPT_ID;
    s.src     = CHARTJS_CDN;
    s.async   = true;
    s.onload  = () => setReady(true);
    s.onerror = () => console.error('[SchoolDashboard] Failed to load Chart.js');
    document.head.appendChild(s);
  }, []); // ← strictly empty — runs once, never again

  return ready;
}

/** Run chart-drawing effect only when Chart.js is ready AND deps change. */
function useChartEffect(cb: () => void, deps: any[], chartJsReady: boolean) {
  // Use a ref so cb identity changes don't retrigger the effect
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!chartJsReady) return;
    cbRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartJsReady, ...deps]);
}

/* ─── Animated counter ───────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Math.floor(eased * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

/* ─── Stat Card ─────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, gradient, delay = 0, prefix = '' }: any) {
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? value : 0, 1200);
  return (
    <div className="stat-card" style={{ animationDelay: `${delay}ms`, background: gradient }}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-value">
        {prefix}{isNum ? animated.toLocaleString('en-IN') : value}
      </div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
      <div className="stat-card-glow" />
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────────── */
function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    paid:      ['#065f46', '#d1fae5', '#10b981'],
    initiated: ['#3730a3', '#ede9fe', '#6366f1'],
    pending:   ['#92400e', '#fef3c7', '#f59e0b'],
    failed:    ['#991b1b', '#fee2e2', '#ef4444'],
    cancelled: ['#374151', '#f3f4f6', '#9ca3af'],
  };
  const [fg, bg, dot] = map[status] ?? ['#374151', '#f3f4f6', '#9ca3af'];
  return (
    <span style={{ background: bg, color: fg, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, display: 'inline-block' }} />
      {status ?? '—'}
    </span>
  );
}

/* ─── Radial Progress ────────────────────────────────────────────────────── */
function RadialProgress({ value, max, color, size = 100, label, sublabel }: any) {
  const pct = max > 0 ? value / max : 0;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: 'Clash Display, sans-serif', lineHeight: 1 }}>{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sublabel}</div>}
      </div>
    </div>
  );
}

/* ─── Class Breakdown ────────────────────────────────────────────────────── */
function ClassBreakdownCard({ byClass, totalPaid }: { byClass: Record<string, number>; totalPaid: number }) {
  const classes = Object.keys(byClass).sort();
  const maxCount = Math.max(...classes.map(c => byClass[c]), 1);
  const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#ef4444','#84cc16'];
  return (
    <div className="glass-card" style={{ animationDelay: '200ms' }}>
      <div className="card-header">
        <span className="card-header-icon">📚</span>
        <span className="card-title">Class-wise Registrations</span>
        <span className="chip chip-green">Paid only</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
        {classes.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No paid registrations yet.</p>}
        {classes.map((cls, idx) => {
          const count = byClass[cls];
          const pct = Math.round((count / maxCount) * 100);
          const share = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          const color = COLORS[idx % COLORS.length];
          return (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: `${color}18`, color, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0, minWidth: 76, textAlign: 'center', border: `1px solid ${color}30` }}>{cls}</span>
              <div style={{ flex: 1, height: 10, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.05)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: 6, transition: 'width 1.2s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 0 8px ${color}60` }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color, minWidth: 24, textAlign: 'right' }}>{count}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 34, textAlign: 'right' }}>{share}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Gender Breakdown ───────────────────────────────────────────────────── */
function GenderBreakdownCard({ byGender, totalPaid }: { byGender: Record<string, number>; totalPaid: number }) {
  const CONFIG: Record<string, { color: string; icon: string; grad: string }> = {
    Male:    { color: '#3b82f6', icon: '👦', grad: 'linear-gradient(135deg,#dbeafe,#eff6ff)' },
    Female:  { color: '#ec4899', icon: '👧', grad: 'linear-gradient(135deg,#fce7f3,#fdf2f8)' },
    Other:   { color: '#8b5cf6', icon: '🧑', grad: 'linear-gradient(135deg,#ede9fe,#f5f3ff)' },
    Unknown: { color: '#94a3b8', icon: '❓', grad: 'linear-gradient(135deg,#f1f5f9,#f8fafc)' },
  };
  const genders = Object.keys(byGender);
  return (
    <div className="glass-card" style={{ animationDelay: '300ms' }}>
      <div className="card-header">
        <span className="card-header-icon">⚧</span>
        <span className="card-title">Gender Distribution</span>
        <span className="chip chip-green">Paid only</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {genders.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No paid registrations yet.</p>}
        {genders.map((g, idx) => {
          const cfg = CONFIG[g] ?? { color: '#94a3b8', icon: '❓', grad: 'linear-gradient(135deg,#f1f5f9,#f8fafc)' };
          const count = byGender[g];
          const pct = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          return (
            <div key={g} style={{
              flex: 1, minWidth: 100, background: cfg.grad,
              border: `1.5px solid ${cfg.color}25`, borderRadius: 16, padding: '18px 14px',
              textAlign: 'center', position: 'relative', overflow: 'hidden',
              animation: 'floatUp .5s ease both', animationDelay: `${idx * 80}ms`,
            }}>
              <div style={{ fontSize: 28 }}>{cfg.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 6, letterSpacing: 0.3 }}>{g.toUpperCase()}</div>
              <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'Clash Display, sans-serif', color: cfg.color, margin: '6px 0 2px', lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{pct}% of paid</div>
              <div style={{ position: 'absolute', bottom: -12, right: -8, fontSize: 56, opacity: 0.06 }}>{cfg.icon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Cross-tab matrix ───────────────────────────────────────────────────── */
function CrossTabCard({ crossTab }: { crossTab: Record<string, Record<string, number>> }) {
  const sortedClasses = Object.keys(crossTab).sort();
  const allGenders = [...new Set(sortedClasses.flatMap(c => Object.keys(crossTab[c])))].sort();
  const GC: Record<string, string> = { Male: '#3b82f6', Female: '#ec4899', Other: '#8b5cf6', Unknown: '#94a3b8' };
  const grandTotal = sortedClasses.reduce((s, c) => s + allGenders.reduce((ss, g) => ss + (Number(crossTab[c][g]) || 0), 0), 0);
  return (
    <div className="glass-card" style={{ animationDelay: '350ms' }}>
      <div className="card-header">
        <span className="card-header-icon">🔢</span>
        <span className="card-title">Class × Gender Matrix</span>
        <span className="chip chip-green">Paid only</span>
      </div>
      {sortedClasses.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No paid registrations yet.</p>}
      {sortedClasses.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, borderBottom: '2px solid var(--border)' }}>CLASS</th>
                {allGenders.map(g => (
                  <th key={g} style={{ textAlign: 'center', padding: '10px 14px', color: GC[g] ?? 'var(--muted)', fontWeight: 700, fontSize: 11, borderBottom: '2px solid var(--border)' }}>
                    <span style={{ background: `${GC[g]}15`, padding: '2px 10px', borderRadius: 20 }}>{g.toUpperCase()}</span>
                  </th>
                ))}
                <th style={{ textAlign: 'center', padding: '10px 14px', color: '#10b981', fontWeight: 700, fontSize: 11, borderBottom: '2px solid var(--border)' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {sortedClasses.map((cls, i) => {
                const rowData = crossTab[cls];
                const rowTotal = allGenders.reduce((s, g) => s + (Number(rowData[g]) || 0), 0);
                const rowPct = grandTotal > 0 ? Math.round((rowTotal / grandTotal) * 100) : 0;
                return (
                  <tr key={cls} className="table-row" style={{ animationDelay: `${i * 30}ms` }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: '#6366f115', color: '#6366f1', padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>{cls}</span>
                    </td>
                    {allGenders.map(g => (
                      <td key={g} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: rowData[g] ? 700 : 400, color: rowData[g] ? GC[g] ?? 'var(--text)' : 'var(--muted)', fontSize: 13 }}>
                        {Number(rowData[g] ?? 0) || '—'}
                      </td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>{rowTotal}</span>
                        <span style={{ fontSize: 9, color: 'var(--muted)' }}>{rowPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(16,185,129,0.05)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--muted)', fontSize: 11 }}>TOTAL</td>
                {allGenders.map(g => {
                  const colTotal = sortedClasses.reduce((s, c) => s + (Number(crossTab[c][g]) || 0), 0);
                  return <td key={g} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: GC[g] ?? 'var(--text)', fontSize: 14 }}>{colTotal}</td>;
                })}
                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900, color: '#10b981', fontSize: 16 }}>{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Revenue Timeline ────────────────────────────────────────────────────── */
function RevenueTimeline({ daily }: { daily: Record<string, { total: number; paid: number; revenue: number }> }) {
  const days = Object.keys(daily).slice(-14);
  const maxRev = Math.max(...days.map(d => daily[d]?.revenue || 0), 1);
  const totalRevLast14 = days.reduce((s, d) => s + (daily[d]?.revenue || 0), 0);
  return (
    <div className="glass-card" style={{ animationDelay: '400ms' }}>
      <div className="card-header">
        <span className="card-header-icon">💹</span>
        <span className="card-title">Revenue — Last 14 Days</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: '#10b981' }}>₹{fmtR(totalRevLast14)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, padding: '0 4px' }}>
        {days.map((d, i) => {
          const rev = daily[d]?.revenue || 0;
          const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
          return (
            <div key={d} title={`${new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}: ₹${fmtR(rev)}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', cursor: 'default' }}>
              <div style={{
                width: '100%', height: `${Math.max(pct, 4)}%`,
                background: 'linear-gradient(180deg, #10b981, #059669)',
                borderRadius: '4px 4px 2px 2px',
                transition: `height 1s cubic-bezier(0.34,1.56,0.64,1) ${i * 40}ms`,
                opacity: rev > 0 ? 1 : 0.2,
                boxShadow: rev > 0 ? '0 2px 8px rgba(16,185,129,0.35)' : 'none',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{days[0] ? new Date(days[0]).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : ''}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{days[days.length-1] ? new Date(days[days.length-1]).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : ''}</span>
      </div>
    </div>
  );
}

/* ─── CSS (injected once, never re-injected) ─────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
  :root {
    --bg: #f0f2f7; --card: #ffffff; --border: #e2e8f0;
    --text: #0f172a; --muted: #64748b; --muted2: #94a3b8;
    --acc: #6366f1; --acc-light: #ede9fe;
    --sidebar-w: 220px; --header-h: 64px;
  }
  * { box-sizing: border-box; }
  @keyframes floatUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
  @keyframes spin    { to { transform:rotate(360deg); } }
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes glow    { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.7;transform:scale(1.08)} }
  .stat-card { border-radius:18px; padding:22px; position:relative; overflow:hidden; animation:floatUp .5s cubic-bezier(0.34,1.56,0.64,1) both; cursor:default; transition:transform .2s ease,box-shadow .2s ease; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
  .stat-card:hover { transform:translateY(-3px); box-shadow:0 8px 30px rgba(0,0,0,0.12); }
  .stat-card-icon  { font-size:22px; margin-bottom:10px; }
  .stat-card-value { font-size:30px; font-weight:900; font-family:'DM Sans',sans-serif; color:#0f172a; line-height:1; letter-spacing:-1px; }
  .stat-card-label { font-size:12px; font-weight:600; color:#475569; margin-top:5px; letter-spacing:.3px; }
  .stat-card-sub   { font-size:11px; color:#64748b; margin-top:4px; font-weight:500; }
  .stat-card-glow  { position:absolute; bottom:-30px; right:-30px; width:90px; height:90px; border-radius:50%; background:rgba(255,255,255,0.3); animation:glow 3s ease infinite; }
  .glass-card { background:#ffffff; border:1px solid var(--border); border-radius:18px; padding:22px; animation:floatUp .5s cubic-bezier(0.34,1.56,0.64,1) both; box-shadow:0 2px 12px rgba(0,0,0,0.04); transition:box-shadow .2s ease; }
  .glass-card:hover { box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .card-header { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
  .card-header-icon { font-size:16px; }
  .card-title { font-size:13px; font-weight:700; color:var(--text); letter-spacing:-.2px; }
  .chip { display:inline-flex; align-items:center; padding:2px 9px; border-radius:20px; font-size:10px; font-weight:700; letter-spacing:.2px; }
  .chip-green { background:#d1fae5; color:#065f46; }
  .chip-blue  { background:#dbeafe; color:#1e40af; }
  .chip-amber { background:#fef3c7; color:#92400e; }
  .table-row { border-bottom:1px solid var(--border); transition:background .12s ease; cursor:default; animation:floatUp .3s ease both; }
  .table-row:hover { background:#f8fafc; }
  .table-row:last-child { border-bottom:none; }
  .nav-btn { width:100%; text-align:left; border:none; border-radius:12px; padding:11px 14px; margin-bottom:3px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:10px; transition:all .18s ease; font-family:'DM Sans',sans-serif; }
  .scroll-thin::-webkit-scrollbar { width:4px; }
  .scroll-thin::-webkit-scrollbar-track { background:transparent; }
  .scroll-thin::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:4px; }
`;

// Inject CSS once at module level — never inside a component or effect
// CSS injected once via useEffect in the component below

/* ─── Main Dashboard ─────────────────────────────────────────────────────── */
export default function SchoolDashboard() {
  const router = useRouter();
  const [user,        setUser]        = useState<any>(null);
  const [data,        setData]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'overview' | 'students'>('overview');
  const [studentTab,  setStudentTab]  = useState<'paid' | 'pending'>('paid');
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [toast,       setToast]       = useState('');
  const chartsRef = useRef<Record<string, any>>({});
  const toastRef  = useRef<any>();

  // Load Chart.js once — guaranteed single script tag
  const chartJsReady = useChartJsLoader();

  // Inject CSS once on mount
  useEffect(() => {
    if (document.getElementById('__school-dash-css__')) return;
    const style = document.createElement('style');
    style.id = '__school-dash-css__';
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: d }) => {
      if (!d.user) { router.push('/school/login'); return; }
      setUser(d.user);
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await authFetch(`${BACKEND}/api/school/dashboard`);
      if (res.status === 401) { router.push('/school/login'); return; }
      if (res.status === 403) { showToast('Access denied — account not linked to a school'); return; }
      const json = await res.json();
      if (json.error) { showToast(json.error); return; }
      setData(json);
    } catch (e: any) {
      showToast('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { if (user) load(); }, [user, load]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 4000);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/school/login');
  }

  function exportCSV(rows: Row[], filename: string) {
    const headers = ['#','Date','Student Name','Class','Gender','Parent Name','Phone','Email','Program','Amount','Payment Status','Gateway','Txn ID'];
    const csvRows = rows.map((r, i) => [
      i + 1,
      r.created_at?.slice(0, 10) ?? '',
      r.student_name  ?? '',
      r.class_grade   ?? '',
      r.gender        ?? '',
      r.parent_name   ?? '',
      r.contact_phone ?? '',
      r.contact_email ?? '',
      r.program_name  ?? '',
      r.payment_status === 'paid' ? (r.final_amount / 100).toFixed(2) : '',
      r.payment_status    ?? '',
      r.gateway           ?? '',
      r.gateway_txn_id    ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv  = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function dc(id: string) {
    if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; }
  }

  /* ── Charts — only run when chartJsReady=true AND (tab or data) changes ── */
  useChartEffect(() => {
    if (!data || tab !== 'overview') return;
    const C = (window as any).Chart;

    // Daily area chart
    dc('daily');
    const daily  = data.daily as Record<string, { total: number; paid: number }>;
    const labels = Object.keys(daily).map(d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const totals = Object.values(daily).map((v: any) => v.total);
    const paids  = Object.values(daily).map((v: any) => v.paid);
    const ctx    = (document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if (ctx) {
      const gradTotal = ctx.createLinearGradient(0, 0, 0, 220);
      gradTotal.addColorStop(0, 'rgba(99,102,241,0.18)'); gradTotal.addColorStop(1, 'rgba(99,102,241,0)');
      const gradPaid = ctx.createLinearGradient(0, 0, 0, 220);
      gradPaid.addColorStop(0, 'rgba(16,185,129,0.22)'); gradPaid.addColorStop(1, 'rgba(16,185,129,0)');
      chartsRef.current.daily = new C(ctx, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Registered', data: totals, borderColor: '#6366f1', backgroundColor: gradTotal, borderWidth: 2.5, fill: true, tension: 0.45, pointRadius: 3, pointBackgroundColor: '#6366f1', pointBorderColor: '#fff', pointBorderWidth: 2 },
          { label: 'Paid',       data: paids,  borderColor: '#10b981', backgroundColor: gradPaid,  borderWidth: 2.5, fill: true, tension: 0.45, pointRadius: 3, pointBackgroundColor: '#10b981', pointBorderColor: '#fff', pointBorderWidth: 2 },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle' } },
            tooltip: { backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 },
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#94a3b8' }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8', maxRotation: 45 }, border: { display: false } },
          },
          animation: { duration: 1000, easing: 'easeOutQuart' },
        },
      });
    }

    // Doughnut — payment status
    dc('status');
    const stats = data.stats;
    const ctx2  = (document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2) chartsRef.current.status = new C(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Pending', 'Failed'],
        datasets: [{ data: [stats.paid, stats.pending, stats.failed], backgroundColor: ['#10b981','#f59e0b','#ef4444'], borderWidth: 0, hoverOffset: 10, borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } },
          tooltip: { backgroundColor: '#1e293b', padding: 10, cornerRadius: 8 },
        },
        cutout: '72%',
        animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
      },
    });

    // Horizontal bar — top classes
    dc('classBar');
    const byClass = data.byClass as Record<string, number>;
    const sortedClasses = Object.keys(byClass).sort((a,b) => byClass[b] - byClass[a]).slice(0,8);
    const ctx3 = (document.getElementById('chartClassBar') as HTMLCanvasElement)?.getContext('2d');
    if (ctx3 && sortedClasses.length > 0) chartsRef.current.classBar = new C(ctx3, {
      type: 'bar',
      data: {
        labels: sortedClasses,
        datasets: [{ label: 'Paid Students', data: sortedClasses.map(c => byClass[c]), backgroundColor: ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#ef4444','#84cc16'], borderRadius: 8, borderSkipped: false }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 10, cornerRadius: 8 } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#94a3b8' }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#475569' }, border: { display: false } },
        },
        animation: { duration: 1000, easing: 'easeOutQuart' },
      },
    });

  }, [tab, data], chartJsReady);

  const allRows           = data?.rows ?? [] as Row[];
  const paidRows          = allRows.filter((r: Row) => r.payment_status === 'paid');
  const pendingRows       = allRows.filter((r: Row) => r.payment_status !== 'paid');
  const classes           = [...new Set(allRows.map((r: Row) => r.class_grade).filter(Boolean))].sort() as string[];
  const activeStudentRows = studentTab === 'paid' ? paidRows : pendingRows;
  const filteredRows      = activeStudentRows.filter((r: Row) => {
    const s = search.toLowerCase();
    const matchSearch = !s || [r.student_name, r.parent_name, r.contact_phone, r.contact_email, r.class_grade, r.gender].join(' ').toLowerCase().includes(s);
    const matchClass  = !classFilter || r.class_grade === classFilter;
    return matchSearch && matchClass;
  });

  if (!user || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f7', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, animation:'pulse 1.5s ease infinite', marginBottom:20 }}>🏫</div>
        <div style={{ width:36, height:36, border:'3px solid #e2e8f0', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 14px' }} />
        <p style={{ color:'#64748b', fontSize:14, fontWeight:500 }}>Loading your dashboard…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f7', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:400, padding:36, background:'#fff', borderRadius:20, border:'1px solid #e2e8f0', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize:40, marginBottom:14 }}>⚠️</div>
        <p style={{ color:'#0f172a', fontSize:17, fontWeight:800, marginBottom:8 }}>Could not load dashboard</p>
        <p style={{ color:'#64748b', fontSize:13, marginBottom:22 }}>Your account may not be linked to a school.</p>
        <button onClick={doLogout} style={{ background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer' }}>Sign Out</button>
      </div>
    </div>
  );

  const { stats, school, byClass, byGender, crossTab, daily } = data;
  const convPct = stats?.total ? Math.round((stats.paid / stats.total) * 100) : 0;
  const TABS = [
    { id: 'overview', icon: '◉', label: 'Overview' },
    { id: 'students', icon: '◎', label: 'Students' },
  ] as const;

  return (
    <>
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, background:'#1e293b', color:'#fff', borderRadius:12, padding:'12px 20px', fontSize:13, fontWeight:600, zIndex:9999, boxShadow:'0 8px 30px rgba(0,0,0,.3)', animation:'floatUp .3s ease', fontFamily:'DM Sans,sans-serif' }}>
          {toast}
        </div>
      )}

      <div style={{ minHeight:'100vh', background:'#f0f2f7', fontFamily:'DM Sans,sans-serif', color:'#0f172a' }}>

        {/* Header */}
        <header style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:64, position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            {school?.logo_url
              ? <img src={school.logo_url} alt="logo" style={{ width:38, height:38, borderRadius:10, objectFit:'cover', border:'1.5px solid #e2e8f0' }} />
              : <div style={{ width:38, height:38, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#fff', flexShrink:0 }}>🏫</div>
            }
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:'#0f172a', lineHeight:1.2 }}>{school?.name ?? 'School Dashboard'}</div>
              <div style={{ fontSize:11, color:'#94a3b8', fontWeight:500 }}>{school?.org_name ?? ''}{school?.city ? ` · ${school.city}` : ''}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={load}
              style={{ background:'#f1f5f9', color:'#475569', border:'none', borderRadius:10, padding:'7px 15px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
            >🔄 Refresh</button>
            <button onClick={doLogout}
              style={{ background:'#fff0f0', color:'#dc2626', border:'none', borderRadius:10, padding:'7px 15px', fontSize:12, fontWeight:600, cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff0f0'; }}
            >Sign Out</button>
          </div>
        </header>

        <div style={{ display:'flex', minHeight:'calc(100vh - 64px)' }}>

          {/* Sidebar */}
          <aside style={{ width:220, background:'#fff', borderRight:'1px solid #e2e8f0', padding:'20px 12px', flexShrink:0, display:'flex', flexDirection:'column' }}>
            {TABS.map((t, idx) => (
              <button key={t.id} onClick={() => setTab(t.id as any)} className="nav-btn"
                style={{ background: tab === t.id ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent', color: tab === t.id ? '#fff' : '#475569', boxShadow: tab === t.id ? '0 4px 14px rgba(99,102,241,0.35)' : 'none', animationDelay: `${idx * 60}ms`, animation: 'floatUp .35s ease both' }}
              >
                <span style={{ fontSize:12, opacity:0.85 }}>{t.icon}</span>{t.label}
                {tab === t.id && <span style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,0.7)' }} />}
              </button>
            ))}
            <div style={{ marginTop:24, background:'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius:14, padding:'16px 14px', border:'1px solid #e2e8f0' }}>
              <div style={{ fontSize:10, color:'#94a3b8', fontWeight:700, marginBottom:12, letterSpacing:0.6 }}>QUICK STATS</div>
              {[
                { label:'Paid',       value: stats?.paid   ?? 0,                        color:'#10b981' },
                { label:'Pending',    value: stats?.unpaid ?? 0,                        color:'#f59e0b' },
                { label:'Conversion', value: `${convPct}%`,                             color:'#6366f1' },
                { label:'Revenue',    value: `₹${fmtR(stats?.totalRev ?? 0)}`,          color:'#8b5cf6' },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'#64748b', fontWeight:500 }}>{s.label}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:'auto', paddingTop:20, display:'flex', justifyContent:'center' }}>
              <RadialProgress value={stats?.paid ?? 0} max={stats?.total ?? 1} color="#6366f1" size={110} label="Conversion" sublabel={`${stats?.paid ?? 0} of ${stats?.total ?? 0}`} />
            </div>
          </aside>

          {/* Main */}
          <main style={{ flex:1, padding:'28px', overflowY:'auto', maxHeight:'calc(100vh - 64px)' }} className="scroll-thin">

            {/* ── OVERVIEW TAB ── */}
            {tab === 'overview' && (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:26 }}>
                  <div style={{ animation:'floatUp .3s ease both' }}>
                    <h2 style={{ margin:0, fontSize:22, fontWeight:900, color:'#0f172a', letterSpacing:-0.5 }}>Overview</h2>
                    <p style={{ margin:'3px 0 0', fontSize:12, color:'#94a3b8', fontWeight:500 }}>{school?.name} · Last updated just now</p>
                  </div>
                  <div style={{ background: convPct >= 60 ? 'linear-gradient(135deg,#d1fae5,#a7f3d0)' : 'linear-gradient(135deg,#fef3c7,#fde68a)', color: convPct >= 60 ? '#065f46' : '#92400e', padding:'8px 16px', borderRadius:24, fontSize:13, fontWeight:800, animation:'scaleIn .4s ease both 100ms', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
                    {convPct >= 60 ? '🔥' : '📈'} {convPct}% conversion
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:16, marginBottom:26 }}>
                  <StatCard icon="✅" label="Paid Students"      value={stats?.paid    ?? 0} gradient="linear-gradient(135deg,#ecfdf5,#d1fae5)" sub={`₹${fmtR(stats?.totalRev ?? 0)} collected`} delay={0} />
                  <StatCard icon="⏳" label="Pending Payment"    value={stats?.unpaid  ?? 0} gradient="linear-gradient(135deg,#fffbeb,#fef3c7)" delay={60} />
                  <StatCard icon="🎓" label="Total Registered"   value={stats?.total   ?? 0} gradient="linear-gradient(135deg,#eef2ff,#e0e7ff)" delay={120} />
                  <StatCard icon="❌" label="Failed / Cancelled" value={stats?.failed  ?? 0} gradient="linear-gradient(135deg,#fff1f2,#ffe4e6)" delay={180} />
                  <StatCard icon="💰" label="Total Revenue"      value={`₹${fmtR(stats?.totalRev ?? 0)}`} gradient="linear-gradient(135deg,#f5f3ff,#ede9fe)" delay={240} />
                  <StatCard icon="📊" label="Conversion Rate"    value={`${convPct}%`}        gradient="linear-gradient(135deg,#ecfeff,#cffafe)" delay={300} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:18, marginBottom:18 }}>
                  <div className="glass-card" style={{ animationDelay:'100ms' }}>
                    <div className="card-header"><span className="card-header-icon">📅</span><span className="card-title">Daily Registrations — Last 30 Days</span></div>
                    <div style={{ height:230 }}><canvas id="chartDaily" /></div>
                  </div>
                  <div className="glass-card" style={{ animationDelay:'150ms' }}>
                    <div className="card-header"><span className="card-header-icon">💳</span><span className="card-title">Payment Status</span></div>
                    <div style={{ height:230 }}><canvas id="chartStatus" /></div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:18, marginBottom:18 }}>
                  <div className="glass-card" style={{ animationDelay:'200ms' }}>
                    <div className="card-header"><span className="card-header-icon">🏆</span><span className="card-title">Top Classes by Paid Count</span></div>
                    <div style={{ height:200 }}><canvas id="chartClassBar" /></div>
                  </div>
                  {daily && <RevenueTimeline daily={daily} />}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
                  {byClass  && <ClassBreakdownCard  byClass={byClass}   totalPaid={stats?.paid ?? 0} />}
                  {byGender && <GenderBreakdownCard byGender={byGender} totalPaid={stats?.paid ?? 0} />}
                </div>
                {crossTab && <CrossTabCard crossTab={crossTab} />}
              </div>
            )}

            {/* ── STUDENTS TAB ── */}
            {tab === 'students' && (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
                  <h2 style={{ margin:0, fontSize:22, fontWeight:900, color:'#0f172a', letterSpacing:-0.5, animation:'floatUp .3s ease both' }}>Students</h2>
                  <div style={{ display:'flex', gap:10, alignItems:'center', animation:'floatUp .3s ease both 50ms' }}>
                    <span className="chip chip-green">{paidRows.length} paid</span>
                    <span className="chip chip-amber">{pendingRows.length} pending</span>
                  </div>
                </div>

                <div style={{ display:'flex', gap:4, marginBottom:20, background:'#f1f5f9', borderRadius:12, padding:4, width:'fit-content', animation:'floatUp .35s ease both 60ms' }}>
                  {([
                    { id:'paid',    label:'Paid',    count:paidRows.length,    color:'#10b981', icon:'✅' },
                    { id:'pending', label:'Pending', count:pendingRows.length, color:'#f59e0b', icon:'⏳' },
                  ] as const).map(st => (
                    <button key={st.id} onClick={() => { setStudentTab(st.id); setSearch(''); setClassFilter(''); }}
                      style={{ padding:'8px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, borderRadius:9, transition:'all .18s', fontFamily:'DM Sans,sans-serif', background: studentTab === st.id ? '#fff' : 'transparent', color: studentTab === st.id ? st.color : '#64748b', boxShadow: studentTab === st.id ? '0 1px 6px rgba(0,0,0,0.08)' : 'none', display:'flex', alignItems:'center', gap:6 }}
                    >
                      <span style={{ fontSize:13 }}>{st.icon}</span>{st.label}
                      <span style={{ background: studentTab === st.id ? `${st.color}15` : 'transparent', color:st.color, borderRadius:20, fontSize:11, padding:'1px 7px', fontWeight:800 }}>{st.count}</span>
                    </button>
                  ))}
                </div>

                <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', animation:'floatUp .35s ease both 100ms' }}>
                  <input placeholder="🔍  Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ flex:1, minWidth:220, border:'1.5px solid #e2e8f0', borderRadius:11, padding:'9px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'#0f172a', background:'#fff' }}
                    onFocus={e => { e.target.style.borderColor='#6366f1'; e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)'; }}
                    onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.boxShadow='none'; }}
                  />
                  <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                    style={{ border:'1.5px solid #e2e8f0', borderRadius:11, padding:'9px 14px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'#0f172a', background:'#fff', cursor:'pointer' }}
                  >
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span style={{ display:'flex', alignItems:'center', fontSize:12, color:'#94a3b8', padding:'0 4px', fontWeight:500 }}>{filteredRows.length} of {activeStudentRows.length}</span>
                  <button onClick={() => exportCSV(filteredRows, `${studentTab}-students-${new Date().toISOString().slice(0,10)}.csv`)}
                    style={{ background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:11, padding:'9px 18px', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', boxShadow:'0 2px 10px rgba(16,185,129,0.35)', fontFamily:'DM Sans,sans-serif' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity='.88')}
                    onMouseLeave={e => (e.currentTarget.style.opacity='1')}
                  >⬇ Export CSV</button>
                </div>

                <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)', animation:'floatUp .4s ease both 150ms' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                          {['#','Date','Student','Class','Gender','Parent','Phone','Program','Amount','Status'].map(h => (
                            <th key={h} style={{ textAlign:'left', padding:'11px 14px', color:'#64748b', fontWeight:700, fontSize:11, whiteSpace:'nowrap', letterSpacing:0.4 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr><td colSpan={10} style={{ padding:'60px', textAlign:'center', color:'#94a3b8' }}>
                            <div style={{ fontSize:36, marginBottom:12 }}>{studentTab === 'paid' ? '🎓' : '⏳'}</div>
                            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{studentTab === 'paid' ? 'No paid students yet' : 'No pending students'}</div>
                            <div style={{ fontSize:12 }}>Students will appear here once they register.</div>
                          </td></tr>
                        ) : filteredRows.map((r, i) => (
                          <tr key={r.id} className="table-row" style={{ animationDelay:`${i * 20}ms` }}>
                            <td style={{ padding:'11px 14px', color:'#cbd5e1', fontSize:11, fontWeight:600 }}>{i + 1}</td>
                            <td style={{ padding:'11px 14px', color:'#94a3b8', fontSize:11, whiteSpace:'nowrap' }}>{r.created_at?.slice(0,10)}</td>
                            <td style={{ padding:'11px 14px', fontWeight:700, whiteSpace:'nowrap', color:'#0f172a' }}>{r.student_name}</td>
                            <td style={{ padding:'11px 14px', whiteSpace:'nowrap' }}>
                              <span style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 9px', borderRadius:6, fontSize:11, fontWeight:700 }}>{r.class_grade}</span>
                            </td>
                            <td style={{ padding:'11px 14px', whiteSpace:'nowrap', fontSize:12, color:'#475569' }}>{r.gender}</td>
                            <td style={{ padding:'11px 14px', whiteSpace:'nowrap', fontSize:12, color:'#475569' }}>{r.parent_name}</td>
                            <td style={{ padding:'11px 14px', whiteSpace:'nowrap' }}>
                              <a href={`tel:${r.contact_phone}`} style={{ color:'#6366f1', fontWeight:600, textDecoration:'none', fontSize:12 }}>{r.contact_phone}</a>
                            </td>
                            <td style={{ padding:'11px 14px', fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>{r.program_name ?? '—'}</td>
                            <td style={{ padding:'11px 14px', fontWeight:700, whiteSpace:'nowrap', color: r.payment_status === 'paid' ? '#10b981' : '#94a3b8' }}>
                              {r.payment_status === 'paid' ? `₹${fmtR(r.final_amount)}` : '—'}
                            </td>
                            <td style={{ padding:'11px 14px', whiteSpace:'nowrap' }}><Badge status={r.payment_status ?? 'pending'} /></td>
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
