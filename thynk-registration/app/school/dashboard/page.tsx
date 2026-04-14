'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;
const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtR = (p: number) => fmt(p / 100);
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

/* ─── Chart.js loader (fixes frozen screen) ─────────────────────────────── */
function useChartJs(cb: () => void, deps: any[]) {
  useEffect(() => {
    if ((window as any).Chart) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ─── Animated counter ───────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(p * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color, delay = 0 }: any) {
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? value : 0, 900);
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--bd)',
      borderRadius: 14,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      animation: `fadeUp .45s ease both`,
      animationDelay: `${delay}ms`,
      borderTop: `3px solid ${color}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: 'Sora,sans-serif', lineHeight: 1 }}>
        {isNum ? animated.toLocaleString('en-IN') : value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: 0.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 2 }}>{sub}</div>}
      <div style={{ position: 'absolute', right: -10, bottom: -10, fontSize: 60, opacity: 0.04, lineHeight: 1 }}>{icon}</div>
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────────── */
function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid:      ['#059669','#d1fae5'],
    initiated: ['#4f46e5','#ede9fe'],
    pending:   ['#d97706','#fef3c7'],
    failed:    ['#dc2626','#fee2e2'],
    cancelled: ['#64748b','#f1f5f9'],
  };
  const [fg, bg] = map[status] ?? ['#64748b','#f1f5f9'];
  return (
    <span style={{ background: bg, color: fg, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>
      {status ?? '—'}
    </span>
  );
}

/* ─── Class breakdown ───────────────────────────────────────────────────── */
function ClassBreakdownCard({ byClass, totalPaid }: { byClass: Record<string, number>; totalPaid: number }) {
  const classes = Object.keys(byClass).sort();
  const maxCount = Math.max(...classes.map(c => byClass[c]), 1);
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20, animation: 'fadeUp .5s ease both', animationDelay: '200ms' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
        📚 Class-wise Paid
        <span style={{ marginLeft: 'auto', fontSize: 10, background: '#d1fae5', color: '#059669', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Paid only</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
        {classes.length === 0 && <p style={{ color: 'var(--m)', fontSize: 13 }}>No paid registrations yet.</p>}
        {classes.map((cls, idx) => {
          const count = byClass[cls];
          const pct = Math.round((count / maxCount) * 100);
          const share = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          return (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp .3s ease both', animationDelay: `${idx * 50}ms` }}>
              <span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0, minWidth: 72, textAlign: 'center' }}>{cls}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bd)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#10b981,#34d399)', borderRadius: 4, transition: 'width 1s ease' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#059669', minWidth: 20, textAlign: 'right' }}>{count}</span>
              <span style={{ fontSize: 10, color: 'var(--m)', minWidth: 32 }}>{share}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Gender breakdown ───────────────────────────────────────────────────── */
function GenderBreakdownCard({ byGender, totalPaid }: { byGender: Record<string, number>; totalPaid: number }) {
  const GC: Record<string, { fg: string; bg: string; icon: string }> = {
    Male:    { fg: '#2563eb', bg: '#eff6ff', icon: '👦' },
    Female:  { fg: '#db2777', bg: '#fdf2f8', icon: '👧' },
    Other:   { fg: '#7c3aed', bg: '#f5f3ff', icon: '🧑' },
    Unknown: { fg: '#64748b', bg: '#f1f5f9', icon: '❓' },
  };
  const genders = Object.keys(byGender);
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20, animation: 'fadeUp .5s ease both', animationDelay: '300ms' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
        ⚧ Gender-wise Paid
        <span style={{ marginLeft: 'auto', fontSize: 10, background: '#d1fae5', color: '#059669', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Paid only</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {genders.length === 0 && <p style={{ color: 'var(--m)', fontSize: 13 }}>No paid registrations yet.</p>}
        {genders.map((g, idx) => {
          const { fg, bg, icon } = GC[g] ?? { fg: '#64748b', bg: '#f1f5f9', icon: '❓' };
          const count = byGender[g];
          const pct = totalPaid > 0 ? Math.round((count / totalPaid) * 100) : 0;
          return (
            <div key={g} style={{
              flex: 1, background: bg, border: `1.5px solid ${fg}33`, borderRadius: 12, padding: '16px 12px', textAlign: 'center',
              animation: 'scaleIn .4s ease both', animationDelay: `${idx * 80}ms`,
            }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 4 }}>{g}</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Sora', color: fg, margin: '6px 0 2px' }}>{count}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{pct}% of paid</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Cross-tab ─────────────────────────────────────────────────────────── */
function CrossTabCard({ crossTab }: { crossTab: Record<string, Record<string, number>> }) {
  const sortedClasses = Object.keys(crossTab).sort();
  const allGenders = [...new Set(sortedClasses.flatMap(c => Object.keys(crossTab[c])))].sort();
  const GC: Record<string, string> = { Male: '#2563eb', Female: '#db2777', Other: '#7c3aed', Unknown: '#94a3b8' };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20, animation: 'fadeUp .5s ease both', animationDelay: '350ms' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
        📊 Class × Gender Matrix
        <span style={{ marginLeft: 'auto', fontSize: 10, background: '#d1fae5', color: '#059669', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Paid only</span>
      </div>
      {sortedClasses.length === 0 && <p style={{ color: 'var(--m)', fontSize: 13 }}>No paid registrations yet.</p>}
      {sortedClasses.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--m)', fontWeight: 600, fontSize: 11, borderBottom: '2px solid var(--bd)' }}>Class</th>
                {allGenders.map(g => (
                  <th key={g} style={{ textAlign: 'center', padding: '8px 12px', color: GC[g] ?? 'var(--m)', fontWeight: 700, fontSize: 11, borderBottom: '2px solid var(--bd)' }}>{g}</th>
                ))}
                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#059669', fontWeight: 700, fontSize: 11, borderBottom: '2px solid var(--bd)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedClasses.map((cls, i) => {
                const rowData = crossTab[cls];
                const rowTotal = allGenders.reduce((s, g) => s + (Number(rowData[g]) || 0), 0);
                return (
                  <tr key={cls} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)', borderBottom: '1px solid var(--bd)', transition: 'background .15s' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 11 }}>{cls}</span>
                    </td>
                    {allGenders.map(g => (
                      <td key={g} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: rowData[g] ? 700 : 400, color: rowData[g] ? 'var(--text)' : 'var(--m2)', fontSize: 13 }}>
                        {Number(rowData[g] ?? 0) || '—'}
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#059669', fontSize: 14 }}>{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(16,185,129,0.06)', borderTop: '2px solid var(--bd)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 800, color: 'var(--m)', fontSize: 11 }}>TOTAL</td>
                {allGenders.map(g => {
                  const colTotal = sortedClasses.reduce((s, c) => s + (Number(crossTab[c][g]) || 0), 0);
                  return <td key={g} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text)' }}>{colTotal}</td>;
                })}
                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, color: '#059669', fontSize: 15 }}>
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

/* ─── Main dashboard ─────────────────────────────────────────────────────── */
export default function SchoolDashboard() {
  const router = useRouter();
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
    setLoading(true);
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
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function dc(id: string) {
    if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; }
  }

  /* ── Chart rendering — uses safe loader, not inline <script> ── */
  useChartJs(() => {
    if (!data || tab !== 'overview') return;
    const C = (window as any).Chart;

    dc('daily');
    const daily  = data.daily as Record<string, { total: number; paid: number }>;
    const labels = Object.keys(daily).map(d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const totals = Object.values(daily).map((v: any) => v.total);
    const paids  = Object.values(daily).map((v: any) => v.paid);
    const ctx    = (document.getElementById('chartDaily') as HTMLCanvasElement)?.getContext('2d');
    if (ctx) chartsRef.current.daily = new C(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Registered', data: totals, backgroundColor: 'rgba(99,102,241,.15)', borderColor: '#6366f1', borderWidth: 2, borderRadius: 6, borderSkipped: false },
          { label: 'Paid',       data: paids,  backgroundColor: 'rgba(16,185,129,.8)',  borderRadius: 6, borderSkipped: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
        animation: { duration: 900, easing: 'easeOutQuart' },
      },
    });

    dc('status');
    const stats   = data.stats;
    const ctx2    = (document.getElementById('chartStatus') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2) chartsRef.current.status = new C(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Pending', 'Failed'],
        datasets: [{ data: [stats.paid, stats.pending, stats.failed], backgroundColor: ['#10b981','#f59e0b','#ef4444'], borderWidth: 3, borderColor: 'transparent', hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
        cutout: '68%',
        animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
      },
    });
  }, [tab, data]);

  const allRows: Row[]  = data?.rows ?? [];
  const paidRows        = allRows.filter(r => r.payment_status === 'paid');
  const pendingRows     = allRows.filter(r => r.payment_status !== 'paid');
  const classes         = [...new Set(allRows.map(r => r.class_grade).filter(Boolean))].sort();
  const activeStudentRows = studentTab === 'paid' ? paidRows : pendingRows;
  const filteredRows    = activeStudentRows.filter(r => {
    const s = search.toLowerCase();
    const matchSearch = !s || [r.student_name, r.parent_name, r.contact_phone, r.contact_email, r.class_grade, r.gender].join(' ').toLowerCase().includes(s);
    const matchClass  = !classFilter || r.class_grade === classFilter;
    return matchSearch && matchClass;
  });

  /* ── CSS keyframes injected once ── */
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
      @keyframes scaleIn { from { opacity:0; transform:scale(.93); } to { opacity:1; transform:scale(1); } }
      @keyframes spin { to { transform:rotate(360deg); } }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  /* ── Loading screen ── */
  if (!user || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, animation: 'pulse 1.5s ease infinite', marginBottom: 16 }}>🏫</div>
        <div style={{ width: 32, height: 32, border: '3px solid var(--bd)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--m)', fontSize: 13 }}>Loading dashboard…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 32, background: 'var(--card)', borderRadius: 16, border: '1px solid var(--bd)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Could not load dashboard</p>
        <p style={{ color: 'var(--m)', fontSize: 13, marginBottom: 20 }}>Your account may not be linked to a school. Contact your administrator.</p>
        <button onClick={doLogout} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign Out</button>
      </div>
    </div>
  );

  const { stats, school, byClass, byGender, crossTab } = data;
  const convPct = stats?.total ? Math.round((stats.paid / stats.total) * 100) : 0;

  const TABS = [
    { id: 'overview', icon: '🏠', label: 'Overview'     },
    { id: 'students', icon: '👨‍🎓', label: 'All Students' },
  ] as const;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: '#1e293b', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.25)', animation: 'fadeUp .3s ease' }}>
          {toast}
        </div>
      )}

      <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'DM Sans,sans-serif' }}>

        {/* Header */}
        <header style={{
          background: 'var(--card)',
          borderBottom: '1px solid var(--bd)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: 'var(--acc3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏫</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', lineHeight: 1.2 }}>{school?.name ?? 'School Dashboard'}</div>
              <div style={{ fontSize: 11, color: 'var(--m)' }}>{school?.org_name ?? ''}{school?.city ? ` · ${school.city}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={load}
              style={{ background: 'var(--acc3)', color: 'var(--acc)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'opacity .15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              🔄 Refresh
            </button>
            <button
              onClick={doLogout}
              style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'opacity .15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '.75')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Sign Out
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>

          {/* Sidebar */}
          <aside style={{ width: 196, background: 'var(--card)', borderRight: '1px solid var(--bd)', padding: '16px 10px', flexShrink: 0 }}>
            {TABS.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', borderRadius: 10,
                  padding: '10px 12px', marginBottom: 4, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: tab === t.id ? 'var(--acc)' : 'transparent',
                  color: tab === t.id ? '#fff' : 'var(--text)',
                  transition: 'all .15s ease',
                  animation: `fadeUp .35s ease both`,
                  animationDelay: `${idx * 60}ms`,
                }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
              </button>
            ))}

            {/* Mini stats in sidebar */}
            <div style={{ marginTop: 24, padding: '16px 10px', background: 'var(--acc3)', borderRadius: 10, animation: 'fadeUp .5s ease both', animationDelay: '200ms' }}>
              <div style={{ fontSize: 11, color: 'var(--m)', fontWeight: 600, marginBottom: 10, letterSpacing: 0.3 }}>QUICK STATS</div>
              {[
                { label: 'Paid', value: stats?.paid ?? 0, color: '#10b981' },
                { label: 'Pending', value: stats?.unpaid ?? 0, color: '#f59e0b' },
                { label: 'Conversion', value: `${convPct}%`, color: 'var(--acc)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--m)' }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)', animation: 'fadeUp .3s ease both' }}>Overview</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--m)', animation: 'fadeUp .3s ease both 50ms' }}>{school?.name}</p>
                  </div>
                  {/* Conversion badge */}
                  <div style={{ background: convPct >= 60 ? '#d1fae5' : '#fef3c7', color: convPct >= 60 ? '#059669' : '#d97706', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800, animation: 'fadeUp .3s ease both 100ms' }}>
                    {convPct}% conversion
                  </div>
                </div>

                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
                  <StatCard icon="✅"  label="Paid Students"      value={stats?.paid    ?? 0} color="#10b981" sub={`₹${fmtR(stats?.totalRev ?? 0)} collected`} delay={0} />
                  <StatCard icon="⏳"  label="Pending Payment"    value={stats?.unpaid  ?? 0} color="#f59e0b" delay={60} />
                  <StatCard icon="👨‍🎓" label="Total Registered"   value={stats?.total   ?? 0} color="#6366f1" delay={120} />
                  <StatCard icon="❌"  label="Failed / Cancelled" value={stats?.failed  ?? 0} color="#ef4444" delay={180} />
                  <StatCard icon="💰"  label="Total Revenue"      value={`₹${fmtR(stats?.totalRev ?? 0)}`} color="#8b5cf6" delay={240} />
                  <StatCard icon="📈"  label="Conversion"         value={`${convPct}%`}        color="#0891b2" delay={300} />
                </div>

                {/* Charts row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginBottom: 20 }}>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20, animation: 'fadeUp .5s ease both', animationDelay: '100ms' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>📅 Daily Registrations (Last 30 days)</div>
                    <div style={{ height: 220 }}><canvas id="chartDaily" /></div>
                  </div>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20, animation: 'fadeUp .5s ease both', animationDelay: '150ms' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>💳 Payment Status</div>
                    <div style={{ height: 220 }}><canvas id="chartStatus" /></div>
                  </div>
                </div>

                {/* Breakdown row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
                  {byClass  && <ClassBreakdownCard  byClass={byClass}   totalPaid={stats?.paid ?? 0} />}
                  {byGender && <GenderBreakdownCard byGender={byGender} totalPaid={stats?.paid ?? 0} />}
                </div>

                {crossTab && <CrossTabCard crossTab={crossTab} />}
              </div>
            )}

            {/* ── ALL STUDENTS ── */}
            {tab === 'students' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: 'var(--text)', animation: 'fadeUp .3s ease both' }}>All Students</h2>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--acc3)', borderRadius: 10, padding: 4, width: 'fit-content', animation: 'fadeUp .35s ease both 50ms' }}>
                  {([
                    { id: 'paid',    label: '✅ Paid',    count: paidRows.length,    color: '#059669' },
                    { id: 'pending', label: '⏳ Pending', count: pendingRows.length, color: '#d97706' },
                  ] as const).map(st => (
                    <button
                      key={st.id}
                      onClick={() => { setStudentTab(st.id); setSearch(''); setClassFilter(''); }}
                      style={{
                        padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        borderRadius: 8, transition: 'all .15s',
                        background: studentTab === st.id ? 'var(--card)' : 'transparent',
                        color: studentTab === st.id ? st.color : 'var(--m)',
                        boxShadow: studentTab === st.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                      }}
                    >
                      {st.label}
                      <span style={{ marginLeft: 6, background: studentTab === st.id ? st.color : 'var(--m)', color: '#fff', borderRadius: 20, fontSize: 10, padding: '1px 7px', fontWeight: 800 }}>
                        {st.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search & filters */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', animation: 'fadeUp .35s ease both 100ms' }}>
                  <input
                    placeholder="Search name, phone, email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, minWidth: 200, border: '1px solid var(--bd)', borderRadius: 9, padding: '8px 13px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', color: 'var(--text)', background: 'var(--card)', transition: 'border-color .15s' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--acc)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--bd)')}
                  />
                  <select
                    value={classFilter}
                    onChange={e => setClassFilter(e.target.value)}
                    style={{ border: '1px solid var(--bd)', borderRadius: 9, padding: '8px 13px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', color: 'var(--text)', background: 'var(--card)' }}
                  >
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--m)', padding: '0 4px' }}>
                    {filteredRows.length} of {activeStudentRows.length}
                  </span>
                  <button
                    onClick={() => exportCSV(filteredRows, `${studentTab}-students-${new Date().toISOString().slice(0,10)}.csv`)}
                    style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'opacity .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    ⬇ Export CSV
                  </button>
                </div>

                {/* Table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden', animation: 'fadeUp .4s ease both 150ms' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--acc3)', borderBottom: '2px solid var(--bd)' }}>
                          {['#','Date','Student','Class','Gender','Parent','Phone','Program','Amount','Status'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--m)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={{ padding: '50px', textAlign: 'center', color: 'var(--m)' }}>
                              <div style={{ fontSize: 32, marginBottom: 10 }}>{studentTab === 'paid' ? '✅' : '⏳'}</div>
                              {studentTab === 'paid' ? 'No paid students yet' : 'No pending students'}
                            </td>
                          </tr>
                        ) : filteredRows.map((r, i) => (
                          <tr
                            key={r.id}
                            style={{ borderBottom: '1px solid var(--bd)', transition: 'background .12s', cursor: 'default' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--acc3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '10px 14px', color: 'var(--m2)', fontSize: 11 }}>{i + 1}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--m)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.created_at?.slice(0,10)}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.student_name}</td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{r.class_grade}</span>
                            </td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>{r.gender}</td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>{r.parent_name}</td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <a href={`tel:${r.contact_phone}`} style={{ color: 'var(--acc)', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>{r.contact_phone}</a>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--m)', whiteSpace: 'nowrap' }}>{r.program_name ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap', color: r.payment_status === 'paid' ? '#059669' : 'var(--m)' }}>
                              {r.payment_status === 'paid' ? `₹${fmtR(r.final_amount)}` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}><Badge status={r.payment_status ?? 'pending'} /></td>
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
