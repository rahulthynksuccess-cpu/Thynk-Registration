'use client';
// ReportingPage.tsx  — Improved version with richer data visualization
// Usage: import { ReportingPage } from '@/components/admin/ReportingPage';

import React, { useState, useEffect, useRef } from 'react';

type Row = Record<string, any>;

const fmt  = (n: any) => { const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, '')); return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const fmtA = (p: number) => fmt(p / 100);
const currSym = (country?: string) => (!country || country === 'India') ? '₹' : '$';

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
  if (days === 0)  { const t = new Date().toISOString().slice(0, 10); return rows.filter(r => r.created_at?.slice(0, 10) === t); }
  const cut = new Date(Date.now() - days * 86400000);
  return rows.filter(r => new Date(r.created_at) >= cut);
}

function getSchoolName(r: Row): string { return r.school_name ?? r.parent_school ?? ''; }

const COUNTRY_EMOJI: Record<string, string> = {
  India: '🇮🇳', 'United Arab Emirates': '🇦🇪', 'Saudi Arabia': '🇸🇦',
  Kuwait: '🇰🇼', Qatar: '🇶🇦', Bahrain: '🇧🇭', Oman: '🇴🇲',
  Singapore: '🇸🇬', Malaysia: '🇲🇾', Indonesia: '🇮🇩', Thailand: '🇹🇭',
  Philippines: '🇵🇭', Nepal: '🇳🇵', Bangladesh: '🇧🇩', 'Sri Lanka': '🇱🇰',
};
const GW_COLORS: Record<string, string> = {
  razorpay: '#4f46e5', cashfree: '#10b981', easebuzz: '#f59e0b',
  paypal: '#0070ba', stripe: '#635bff',
};
const PALETTE = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#84cc16','#14b8a6'];
const RANK_COLORS = ['#FFD700','#C0C0C0','#CD7F32', ...Array(7).fill('#4f46e5')];
const RANK_MEDALS = ['🥇','🥈','🥉'];

// ── Sub-components ─────────────────────────────────────────────────────────

function CJSCanvas({ id }: { id: string }) {
  return <canvas id={id} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

function ChartCard({ title, note, children, tall, wide }: { title: string; note?: string; children: React.ReactNode; tall?: boolean; wide?: boolean }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '18px 20px', gridColumn: wide ? 'span 2' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, background: 'var(--acc)', borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {note && (
          <span style={{ fontSize: 10, background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 20, fontWeight: 600, marginLeft: 'auto', letterSpacing: '.03em' }}>{note}</span>
        )}
      </div>
      <div style={{ height: tall ? 300 : 220, position: 'relative' }}>{children}</div>
    </div>
  );
}

function KPI({ icon, label, val, sub, color = 'var(--acc)', highlight = false }: { icon: string; label: string; val: any; sub?: string; color?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? `${color}10` : 'var(--card)',
      border: `1.5px solid ${highlight ? `${color}35` : 'var(--bd)'}`,
      borderRadius: 16, padding: '18px 20px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Sora,sans-serif', color, lineHeight: 1 }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 28 }}>
      <div style={{ width: 3, height: 16, background: 'var(--acc)', borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</span>
      {note && <span style={{ fontSize: 10, background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{note}</span>}
    </div>
  );
}

// Inline bar for tables
function InlineBar({ value, max, color = 'var(--acc)' }: { value: number; max: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bd)', overflow: 'hidden', minWidth: 50 }}>
        <div style={{ width: `${max > 0 ? Math.max(2, Math.round(value / max * 100)) : 0}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 24, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// Rank row used in leaderboards
function RankRow({ rank, name, primary, secondary, primaryColor = '#f59e0b' }: { rank: number; name: string; primary: string; secondary?: string; primaryColor?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
      background: rank < 3 ? `${RANK_COLORS[rank]}09` : 'transparent',
      border: rank < 3 ? `1px solid ${RANK_COLORS[rank]}25` : '1px solid transparent',
    }}>
      <span style={{ fontSize: rank < 3 ? 18 : 12, width: 24, textAlign: 'center', flexShrink: 0, fontWeight: 800, color: RANK_COLORS[rank] }}>
        {rank < 3 ? RANK_MEDALS[rank] : rank + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={name}>{name}</div>
        {secondary && <div style={{ fontSize: 10, color: 'var(--m)', marginTop: 2 }}>{secondary}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: primaryColor, fontFamily: 'Sora,sans-serif', flexShrink: 0 }}>{primary}</div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export function ReportingPage({ allRows, programs, schools }: { allRows: Row[]; programs: Row[]; schools: Row[] }) {
  const [timelineDays,  setTimelineDays]  = useState(-1);
  const [filterProgram, setFilterProgram] = useState('');
  const [activeSection, setActiveSection] = useState<'overview' | 'schools' | 'classes' | 'gender' | 'payment'>('overview');
  const chartsRef = useRef<Record<string, any>>({});

  const base     = filterProgram ? allRows.filter(r => r.program_name === filterProgram) : allRows;
  const rows     = filterByTimeline(base, timelineDays);
  const paidRows = rows.filter(r => r.payment_status === 'paid');

  // ── School stats ───────────────────────────────────────────────
  const totalSchools   = schools.length;
  const activeSchools  = schools.filter(s => s.is_active !== false).length;
  const pendingSchools = schools.filter(s => s.is_active === false && s.registration_open !== true).length;
  const countrySet     = [...new Set(schools.map(s => s.country ?? 'India').filter(Boolean))];
  const totalCountries = countrySet.length;

  // ── Revenue split ──────────────────────────────────────────────
  const inrPaid  = paidRows.filter(r => !r.country || r.country === 'India');
  const usdPaid  = paidRows.filter(r => r.country && r.country !== 'India');
  const inrRev   = inrPaid.reduce((a, r) => a + (r.final_amount ?? 0), 0);
  const usdRev   = usdPaid.reduce((a, r) => a + (r.final_amount ?? 0), 0);
  const totalRev = paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0);
  const conv     = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;
  const avgINR   = inrPaid.length ? Math.round(inrRev / inrPaid.length) : 0;
  const discountUsed = rows.filter(r => r.discount_code).length;
  const discountSaved = rows.reduce((s, r) => s + (r.discount_amount ?? 0), 0);

  // ── Class stats ────────────────────────────────────────────────
  const classSet   = [...new Set(paidRows.map(r => r.class_grade).filter(Boolean))].sort();
  const classStats = classSet.map(c => {
    const cr = paidRows.filter(r => r.class_grade === c);
    return { cls: c, total: cr.length };
  });

  // ── Gender stats ───────────────────────────────────────────────
  const genderStats   = ['Male', 'Female', 'Other'].map(g => ({ gender: g, total: paidRows.filter(r => r.gender === g).length })).filter(g => g.total > 0);
  const unknownGender = paidRows.filter(r => !['Male', 'Female', 'Other'].includes(r.gender)).length;

  // ── Gateway stats ──────────────────────────────────────────────
  const gatewaySet   = [...new Set(rows.map(r => r.gateway).filter(Boolean))];
  const gatewayStats = gatewaySet.map(g => {
    const all  = rows.filter(r => r.gateway === g);
    const paid = all.filter(r => r.payment_status === 'paid');
    return { gw: g, attempts: all.length, paid: paid.length, rev: paid.reduce((a, r) => a + (r.final_amount ?? 0), 0) };
  }).sort((a, b) => b.paid - a.paid);

  // ── School leaderboards ────────────────────────────────────────
  const allSchoolNames    = [...new Set(paidRows.map(r => getSchoolName(r)).filter(Boolean))];
  const schoolRevMap      = allSchoolNames.map(s => {
    const sr = paidRows.filter(r => getSchoolName(r) === s);
    return { name: s, students: sr.length, rev: sr.reduce((a, r) => a + (r.final_amount ?? 0), 0), country: sr[0]?.country ?? 'India' };
  });
  const topRevenueSchools = [...schoolRevMap].sort((a, b) => b.rev - a.rev).slice(0, 10);
  const topStudentSchools = [...schoolRevMap].sort((a, b) => b.students - a.students).slice(0, 10);

  // ── Country stats ──────────────────────────────────────────────
  const countryStats = countrySet.map(c => {
    const cr = paidRows.filter(r => (r.country ?? 'India') === c);
    const sc = [...new Set(cr.map(r => getSchoolName(r)).filter(Boolean))];
    return { country: c, schools: sc.length, students: cr.length, rev: cr.reduce((a, r) => a + (r.final_amount ?? 0), 0) };
  }).filter(c => c.students > 0).sort((a, b) => b.students - a.students);

  // ── Gender × Class ─────────────────────────────────────────────
  const genderClassStats = classSet.map(c => {
    const cr = paidRows.filter(r => r.class_grade === c);
    const byG: Record<string, number> = {};
    ['Male', 'Female', 'Other'].forEach(g => { byG[g] = cr.filter(r => r.gender === g).length; });
    return { cls: c, total: cr.length, byGender: byG };
  });

  // ── Chart.js ───────────────────────────────────────────────────
  function dc(id: string) { if (chartsRef.current[id]) { chartsRef.current[id].destroy(); delete chartsRef.current[id]; } }

  useEffect(() => {
    const C = (window as any).Chart;
    if (!C) return;

    if (activeSection === 'overview') {
      // Payment status bar
      dc('statusBar');
      const ctx3 = (document.getElementById('statusBar') as HTMLCanvasElement)?.getContext('2d');
      const statusGroups  = ['paid', 'initiated', 'pending', 'failed', 'cancelled'];
      const statusCounts  = statusGroups.map(s => rows.filter(r => r.payment_status === s).length);
      const statusColors  = ['#10b981', '#4f46e5', '#f59e0b', '#ef4444', '#94a3b8'];
      if (ctx3) {
        chartsRef.current.statusBar = new C(ctx3, {
          type: 'bar',
          data: {
            labels: statusGroups,
            datasets: [{ data: statusCounts, backgroundColor: statusColors, borderRadius: 8, borderSkipped: false }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } },
        });
      }

      // Gateway revenue doughnut
      dc('gwRevDoughnut');
      const ctx1 = (document.getElementById('gwRevDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx1 && gatewayStats.length) {
        chartsRef.current.gwRevDoughnut = new C(ctx1, {
          type: 'doughnut',
          data: { labels: gatewayStats.map(g => g.gw), datasets: [{ data: gatewayStats.map(g => g.rev / 100), backgroundColor: gatewayStats.map(g => GW_COLORS[g.gw] ?? '#94a3b8'), borderWidth: 3, borderColor: 'var(--card)', hoverOffset: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } }, cutout: '62%' },
        });
      }

      // INR vs USD
      dc('currencyDoughnut');
      const ctx2 = (document.getElementById('currencyDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx2) {
        chartsRef.current.currencyDoughnut = new C(ctx2, {
          type: 'doughnut',
          data: { labels: ['INR (India)', 'USD (International)'], datasets: [{ data: [inrRev / 100, usdRev / 100], backgroundColor: ['#4f46e5', '#22c55e'], borderWidth: 3, borderColor: 'var(--card)', hoverOffset: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } }, cutout: '62%' },
        });
      }
    }

    if (activeSection === 'schools') {
      dc('countryBar');
      const ctx4 = (document.getElementById('countryBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx4 && countryStats.length) {
        chartsRef.current.countryBar = new C(ctx4, {
          type: 'bar',
          data: {
            labels: countryStats.map(c => `${COUNTRY_EMOJI[c.country] ?? '🌍'} ${c.country}`),
            datasets: [
              { label: 'Students', data: countryStats.map(c => c.students), backgroundColor: 'rgba(16,185,129,.75)', borderRadius: 6 },
              { label: 'Schools',  data: countryStats.map(c => c.schools),  backgroundColor: 'rgba(79,70,229,.55)',  borderRadius: 6 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } },
        });
      }

      dc('revByCountry');
      const ctx5 = (document.getElementById('revByCountry') as HTMLCanvasElement)?.getContext('2d');
      if (ctx5 && countryStats.length) {
        chartsRef.current.revByCountry = new C(ctx5, {
          type: 'bar',
          data: {
            labels: countryStats.map(c => `${COUNTRY_EMOJI[c.country] ?? '🌍'} ${c.country}`),
            datasets: [{ label: 'Revenue', data: countryStats.map(c => c.rev / 100), backgroundColor: countryStats.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'), borderRadius: 6 }],
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: (v: number) => '₹' + fmt(v) } }, y: { grid: { display: false } } } },
        });
      }
    }

    if (activeSection === 'classes') {
      dc('classDoughnut');
      const ctx6 = (document.getElementById('classDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx6 && classStats.length) {
        chartsRef.current.classDoughnut = new C(ctx6, {
          type: 'doughnut',
          data: { labels: classStats.map(c => c.cls), datasets: [{ data: classStats.map(c => c.total), backgroundColor: classStats.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 3, borderColor: 'var(--card)', hoverOffset: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } }, cutout: '50%' },
        });
      }

      dc('classGenderBar');
      const ctx7 = (document.getElementById('classGenderBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx7 && genderClassStats.length) {
        chartsRef.current.classGenderBar = new C(ctx7, {
          type: 'bar',
          data: {
            labels: genderClassStats.map(c => c.cls),
            datasets: [
              { label: 'Male',   data: genderClassStats.map(c => c.byGender.Male ?? 0),   backgroundColor: 'rgba(37,99,235,0.75)',  borderRadius: 5 },
              { label: 'Female', data: genderClassStats.map(c => c.byGender.Female ?? 0), backgroundColor: 'rgba(219,39,119,0.75)', borderRadius: 5 },
              { label: 'Other',  data: genderClassStats.map(c => c.byGender.Other ?? 0),  backgroundColor: 'rgba(124,58,237,0.75)', borderRadius: 5 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } } } },
        });
      }
    }

    if (activeSection === 'gender') {
      const allWithUnknown = [...genderStats, ...(unknownGender > 0 ? [{ gender: 'Unknown', total: unknownGender }] : [])];
      const GC: Record<string, string> = { Male: '#2563eb', Female: '#db2777', Other: '#7c3aed', Unknown: '#94a3b8' };

      dc('genderDoughnut');
      const ctx8 = (document.getElementById('genderDoughnut') as HTMLCanvasElement)?.getContext('2d');
      if (ctx8 && allWithUnknown.length) {
        chartsRef.current.genderDoughnut = new C(ctx8, {
          type: 'doughnut',
          data: { labels: allWithUnknown.map(g => g.gender), datasets: [{ data: allWithUnknown.map(g => g.total), backgroundColor: allWithUnknown.map(g => GC[g.gender] ?? '#94a3b8'), borderWidth: 3, borderColor: 'var(--card)', hoverOffset: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } }, cutout: '55%' },
        });
      }

      dc('genderBarHoriz');
      const ctx9 = (document.getElementById('genderBarHoriz') as HTMLCanvasElement)?.getContext('2d');
      if (ctx9 && allWithUnknown.length) {
        chartsRef.current.genderBarHoriz = new C(ctx9, {
          type: 'bar',
          data: { labels: allWithUnknown.map(g => g.gender), datasets: [{ data: allWithUnknown.map(g => g.total), backgroundColor: allWithUnknown.map(g => GC[g.gender] ?? '#94a3b8'), borderRadius: 8, borderSkipped: false }] },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { grid: { display: false } } } },
        });
      }
    }

    if (activeSection === 'payment') {
      dc('gwBar');
      const ctx10 = (document.getElementById('gwBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx10 && gatewayStats.length) {
        chartsRef.current.gwBar = new C(ctx10, {
          type: 'bar',
          data: {
            labels: gatewayStats.map(g => g.gw),
            datasets: [
              { label: 'Paid',     data: gatewayStats.map(g => g.paid),                backgroundColor: 'rgba(16,185,129,.8)',  borderRadius: 6 },
              { label: 'Dropped',  data: gatewayStats.map(g => g.attempts - g.paid),  backgroundColor: 'rgba(239,68,68,.45)', borderRadius: 6 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } } } },
        });
      }

      dc('gwRevBar');
      const ctx11 = (document.getElementById('gwRevBar') as HTMLCanvasElement)?.getContext('2d');
      if (ctx11 && gatewayStats.length) {
        chartsRef.current.gwRevBar = new C(ctx11, {
          type: 'bar',
          data: {
            labels: gatewayStats.map(g => g.gw),
            datasets: [{ label: 'Revenue', data: gatewayStats.map(g => g.rev / 100), backgroundColor: gatewayStats.map(g => GW_COLORS[g.gw] ?? '#8b5cf6'), borderRadius: 8 }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v: number) => '₹' + fmt(v) }, grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } } },
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, rows.length, filterProgram, timelineDays]);

  const SECTIONS = [
    { id: 'overview', icon: '🏠', label: 'Summary'  },
    { id: 'schools',  icon: '🏫', label: 'Schools'  },
    { id: 'classes',  icon: '📚', label: 'Classes'  },
    { id: 'gender',   icon: '⚧',  label: 'Gender'   },
    { id: 'payment',  icon: '💳', label: 'Payments' },
  ] as const;

  const SS: React.CSSProperties = { border: '1.5px solid var(--bd)', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', color: 'var(--text)', background: 'var(--card)', cursor: 'pointer' };

  return (
    <div>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="topbar" style={{ marginBottom: 20 }}>
        <div className="topbar-left">
          <h1>Reporting <span>Analytics</span></h1>
          <p>
            {totalSchools} schools · {paidRows.length.toLocaleString()} paid
            {' · ₹'}{ fmtA(inrRev)}{usdRev > 0 ? ` + $${fmtA(usdRev)} USD` : ''}
            {filterProgram ? ` · ${filterProgram}` : ''}
          </p>
        </div>
        <div className="topbar-right" style={{ gap: 10 }}>
          <select value={filterProgram} onChange={e => setFilterProgram(e.target.value)} style={{ ...SS, minWidth: 160 }}>
            <option value="">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIMELINE_OPTIONS.map(opt => (
              <button key={opt.label} onClick={() => setTimelineDays(opt.days)} style={{
                padding: '6px 10px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background:     timelineDays === opt.days ? 'var(--acc)' : 'transparent',
                borderColor:    timelineDays === opt.days ? 'var(--acc)' : 'var(--bd)',
                color:          timelineDays === opt.days ? '#fff'       : 'var(--m)',
                transition: 'all .12s',
              }}>{opt.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section nav tabs ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '2px solid var(--bd)', paddingBottom: 0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id as any)} style={{
            padding: '11px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: 'transparent',
            borderBottom: `3px solid ${activeSection === s.id ? 'var(--acc)' : 'transparent'}`,
            color: activeSection === s.id ? 'var(--acc)' : 'var(--m)',
            marginBottom: -2, transition: 'all .12s',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SUMMARY                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeSection === 'overview' && (
        <div>
          {/* ── KPI tiles ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <KPI icon="🏫" label="Total Schools"   val={totalSchools}          color="var(--acc)" sub={`${activeSchools} active · ${pendingSchools} pending`} highlight />
            <KPI icon="🌍" label="Countries"         val={totalCountries}        color="#8b5cf6"    sub="from school records" />
            <KPI icon="✅" label="Paid Students"     val={paidRows.length}       color="#10b981"    sub={`${conv}% conversion`} highlight />
            <KPI icon="⏳" label="Pending / Initiated" val={rows.filter(r=>['pending','initiated'].includes(r.payment_status)).length} color="#f59e0b" sub="awaiting payment" />
            <KPI icon="💰" label="INR Collected"     val={`₹${fmtA(inrRev)}`}  color="#4f46e5"    sub={`avg ₹${fmtA(avgINR)}`} highlight />
            <KPI icon="💵" label="USD Collected"     val={`$${fmtA(usdRev)}`}  color="#22c55e"    sub={`${usdPaid.length} txns`} />
            <KPI icon="🏷️" label="Discounts Used"    val={discountUsed}          color="#ec4899"    sub={`₹${fmtA(discountSaved)} saved`} />
            <KPI icon="📚" label="Unique Classes"    val={classSet.length}       color="#06b6d4"    sub="grades enrolled (paid)" />
          </div>

          {/* ── Chart row ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
            <ChartCard title="📊 Payment Status Breakdown">
              <CJSCanvas id="statusBar" />
            </ChartCard>
            <ChartCard title="🏦 Revenue by Gateway">
              <CJSCanvas id="gwRevDoughnut" />
            </ChartCard>
            <ChartCard title="💱 INR vs USD Revenue">
              <CJSCanvas id="currencyDoughnut" />
            </ChartCard>
          </div>

          {/* ── Funnel ────────────────────────────────────────────── */}
          <SectionHead title="Registration → Payment Funnel" />
          {(() => {
            const total     = rows.length;
            const initiated = rows.filter(r => ['initiated', 'pending'].includes(r.payment_status)).length;
            const paid2     = paidRows.length;
            const failed    = rows.filter(r => ['failed', 'cancelled'].includes(r.payment_status)).length;
            const steps = [
              { label: 'Registered', val: total,     color: '#4f46e5', icon: '📋', desc: '100% started' },
              { label: 'Initiated',  val: initiated, color: '#f59e0b', icon: '⏳', desc: total ? `${Math.round(initiated/total*100)}% of total` : '' },
              { label: 'Paid',       val: paid2,     color: '#10b981', icon: '✅', desc: total ? `${Math.round(paid2/total*100)}% conversion` : '' },
              { label: 'Failed',     val: failed,    color: '#ef4444', icon: '❌', desc: total ? `${Math.round(failed/total*100)}% dropped` : '' },
            ];
            return (
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginBottom: 24 }}>
                {steps.map((s, i) => (
                  <React.Fragment key={s.label}>
                    <div style={{ flex: 1, background: `${s.color}0e`, border: `2px solid ${s.color}30`, borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 30, marginBottom: 6 }}>{s.icon}</div>
                      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Sora,sans-serif', color: s.color, margin: '4px 0 6px', lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.label}</div>
                      {s.desc && <div style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.desc}</div>}
                      {/* Progress bar */}
                      <div style={{ marginTop: 10, height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${total ? Math.min(100, Math.round(s.val / total * 100)) : 0}%`, height: '100%', background: s.color, borderRadius: 2 }} />
                      </div>
                    </div>
                    {i < steps.length - 1 && <div style={{ display: 'flex', alignItems: 'center', color: 'var(--m)', fontSize: 18, flexShrink: 0 }}>→</div>}
                  </React.Fragment>
                ))}
              </div>
            );
          })()}

          {/* ── Gateway summary table ──────────────────────────────── */}
          <SectionHead title="Gateway Summary" note="All statuses" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 24 }}>
            {gatewayStats.map(g => (
              <div key={g.gw} style={{ background: 'var(--card)', border: `1.5px solid ${GW_COLORS[g.gw] ?? 'var(--bd)'}30`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: GW_COLORS[g.gw] ?? '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{g.gw}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--m)' }}>Paid</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>{g.paid}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--m)' }}>Conv%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GW_COLORS[g.gw] ?? 'var(--acc)' }}>{g.attempts ? Math.round(g.paid / g.attempts * 100) : 0}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${g.attempts ? Math.round(g.paid / g.attempts * 100) : 0}%`, height: '100%', background: GW_COLORS[g.gw] ?? 'var(--acc)', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 8, textAlign: 'right', fontWeight: 600 }}>
                  ₹{fmtA(g.rev)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SCHOOLS                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeSection === 'schools' && (
        <div>
          {/* School overview KPIs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <KPI icon="🏫" label="Total Schools"   val={totalSchools}  color="var(--acc)" sub={`${activeSchools} active`} highlight />
            <KPI icon="🌍" label="Countries"         val={totalCountries} color="#8b5cf6"  sub="geographic spread" />
            <KPI icon="🎓" label="Unique Schools (Paid)" val={[...new Set(paidRows.map(r=>getSchoolName(r)).filter(Boolean))].length} color="#10b981" sub="with paid registrations" highlight />
            <KPI icon="📊" label="Avg Students/School" val={allSchoolNames.length ? Math.round(paidRows.length / allSchoolNames.length) : 0} color="#f59e0b" sub="per school (paid)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <ChartCard title="🌍 Students & Schools by Country" tall>
              <CJSCanvas id="countryBar" />
            </ChartCard>
            <ChartCard title="💰 Revenue by Country (Horizontal)" tall>
              <CJSCanvas id="revByCountry" />
            </ChartCard>
          </div>

          {/* Country table */}
          <SectionHead title="Country-wise Breakdown" note="Paid registrations only" />
          {countryStats.length === 0
            ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--m2)', fontSize: 13 }}>No paid registrations</div>
            : (
              <div className="tbl-wrap" style={{ marginBottom: 24 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>Schools</th>
                      <th>Students</th>
                      <th>Revenue</th>
                      <th>Avg / Student</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryStats.map((c, i) => (
                      <tr key={c.country}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>{COUNTRY_EMOJI[c.country] ?? '🌍'}</span>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{c.country}</span>
                          </div>
                        </td>
                        <td><span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{c.schools}</span></td>
                        <td><InlineBar value={c.students} max={Math.max(...countryStats.map(x => x.students))} color="#10b981" /></td>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'Sora,sans-serif' }}>
                            {currSym(c.country)}{fmtA(c.rev)}
                          </span>
                        </td>
                        <td style={{ color: 'var(--m)', fontSize: 12 }}>{currSym(c.country)}{c.students ? fmtA(Math.round(c.rev / c.students)) : '0'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 5, background: 'var(--bd)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${paidRows.length ? Math.round(c.students / paidRows.length * 100) : 0}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE[i % PALETTE.length] }}>
                              {paidRows.length ? Math.round(c.students / paidRows.length * 100) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(79,70,229,0.06)' }}>
                      <td style={{ fontWeight: 800, color: 'var(--acc)' }}>TOTAL</td>
                      <td><span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{[...new Set(paidRows.map(r => getSchoolName(r)).filter(Boolean))].length}</span></td>
                      <td><span style={{ color: '#10b981', fontWeight: 800, fontSize: 14 }}>{paidRows.length}</span></td>
                      <td><span style={{ fontWeight: 800, fontFamily: 'Sora,sans-serif', color: 'var(--text)' }}>₹{fmtA(inrRev)}{usdRev > 0 && <span style={{ color: '#22c55e', fontSize: '0.85em', marginLeft: 4 }}>+${fmtA(usdRev)}</span>}</span></td>
                      <td style={{ color: 'var(--m)', fontSize: 12 }}>₹{inrPaid.length ? fmtA(Math.round(inrRev / inrPaid.length)) : '0'}</td>
                      <td style={{ fontWeight: 800, color: 'var(--acc)' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

          {/* Top schools leaderboards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <SectionHead title="🏆 Top 10 Schools — Revenue" note="Paid only" />
              <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topRevenueSchools.map((s, i) => (
                  <RankRow key={s.name} rank={i} name={s.name} primary={`${currSym(s.country)}${fmtA(s.rev)}`} secondary={`${s.students} paid students`} />
                ))}
              </div>
            </div>
            <div>
              <SectionHead title="🎓 Top 10 Schools — Students" note="Paid only" />
              <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topStudentSchools.map((s, i) => (
                  <RankRow key={s.name} rank={i} name={s.name} primary={String(s.students)} secondary={`${currSym(s.country)}${fmtA(s.rev)}`} primaryColor="#06b6d4" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* CLASSES                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeSection === 'classes' && (
        <div>
          {/* Class KPIs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <KPI icon="📚" label="Unique Classes"   val={classSet.length}  color="var(--acc)" sub="grades enrolled (paid)" highlight />
            <KPI icon="👨‍🎓" label="Avg Class Size"   val={classStats.length ? Math.round(paidRows.length / classStats.length) : 0} color="#10b981" sub="students per grade" />
            <KPI icon="🏆" label="Top Class" val={classStats.sort((a,b)=>b.total-a.total)[0]?.cls ?? '—'} color="#f59e0b" sub={`${classStats[0]?.total ?? 0} students`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <ChartCard title="📚 Students per Class" tall>
              <CJSCanvas id="classDoughnut" />
            </ChartCard>
            <ChartCard title="⚧ Class × Gender (Stacked)" tall>
              <CJSCanvas id="classGenderBar" />
            </ChartCard>
          </div>

          <SectionHead title="Class Summary Table" note="Paid registrations only" />
          <div className="tbl-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  <th>👦 Male</th>
                  <th>👧 Female</th>
                  <th>🧑 Other</th>
                  <th>M:F Ratio</th>
                  <th style={{ minWidth: 120 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {genderClassStats.map(c => {
                  const mf = c.byGender.Female > 0 ? (c.byGender.Male / c.byGender.Female).toFixed(1) : '∞';
                  return (
                    <tr key={c.cls}>
                      <td><span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{c.cls}</span></td>
                      <td><span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', fontFamily: 'Sora,sans-serif' }}>{c.total}</span></td>
                      <td><span style={{ color: '#2563eb', fontWeight: 700 }}>{c.byGender.Male || 0}</span></td>
                      <td><span style={{ color: '#db2777', fontWeight: 700 }}>{c.byGender.Female || 0}</span></td>
                      <td><span style={{ color: '#7c3aed', fontWeight: 700 }}>{c.byGender.Other || 0}</span></td>
                      <td><span style={{ fontSize: 12, color: 'var(--m)', fontFamily: 'Sora,sans-serif', fontWeight: 600 }}>{mf}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bd)', overflow: 'hidden', minWidth: 60 }}>
                            <div style={{ width: `${paidRows.length ? Math.round(c.total / paidRows.length * 100) : 0}%`, height: '100%', background: 'var(--acc)', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--acc)', minWidth: 30 }}>
                            {paidRows.length ? Math.round(c.total / paidRows.length * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'rgba(79,70,229,0.06)', fontWeight: 800 }}>
                  <td style={{ color: 'var(--acc)', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ fontWeight: 800, fontSize: 16, fontFamily: 'Sora,sans-serif' }}>{paidRows.length}</td>
                  <td style={{ color: '#2563eb', fontWeight: 800 }}>{genderClassStats.reduce((s, c) => s + (c.byGender.Male || 0), 0)}</td>
                  <td style={{ color: '#db2777', fontWeight: 800 }}>{genderClassStats.reduce((s, c) => s + (c.byGender.Female || 0), 0)}</td>
                  <td style={{ color: '#7c3aed', fontWeight: 800 }}>{genderClassStats.reduce((s, c) => s + (c.byGender.Other || 0), 0)}</td>
                  <td colSpan={2} style={{ color: 'var(--acc)', fontWeight: 800 }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Country × Class matrix */}
          {(() => {
            const top5Countries = [...new Set(paidRows.map(r => r.country ?? 'India').filter(Boolean))]
              .map(c => ({ c, n: paidRows.filter(r => (r.country ?? 'India') === c).length }))
              .sort((a, b) => b.n - a.n).slice(0, 5).map(x => x.c);
            const matrix = classSet.map(cls => {
              const entry: Record<string, any> = { cls };
              top5Countries.forEach(c => { entry[c] = paidRows.filter(r => r.class_grade === cls && (r.country ?? 'India') === c).length; });
              entry.total = paidRows.filter(r => r.class_grade === cls).length;
              return entry;
            });
            return (
              <>
                <SectionHead title="Class × Country Matrix" note="Paid only" />
                <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--m)', fontSize: 11, borderBottom: '1.5px solid var(--bd)' }}>Class</th>
                        {top5Countries.map(c => (
                          <th key={c} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--m)', fontSize: 11, borderBottom: '1.5px solid var(--bd)', whiteSpace: 'nowrap' }}>
                            {COUNTRY_EMOJI[c] ?? '🌍'} {c}
                          </th>
                        ))}
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--acc)', fontSize: 11, borderBottom: '1.5px solid var(--bd)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row, i) => (
                        <tr key={row.cls} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '9px 16px' }}>
                            <span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 10px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>{row.cls}</span>
                          </td>
                          {top5Countries.map(c => (
                            <td key={c} style={{ padding: '9px 14px', textAlign: 'center', fontWeight: row[c] > 0 ? 700 : 400, color: row[c] > 0 ? 'var(--text)' : 'var(--m2)', fontSize: 13 }}>{row[c] || '—'}</td>
                          ))}
                          <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--acc)', fontSize: 14 }}>{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'rgba(79,70,229,0.06)', borderTop: '2px solid var(--bd)' }}>
                        <td style={{ padding: '9px 16px', fontWeight: 800, color: 'var(--m)', fontSize: 11 }}>TOTAL</td>
                        {top5Countries.map(c => (
                          <td key={c} style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--acc)', fontSize: 13 }}>
                            {paidRows.filter(r => (r.country ?? 'India') === c).length || '—'}
                          </td>
                        ))}
                        <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 900, color: 'var(--acc)', fontSize: 15 }}>{paidRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* GENDER                                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeSection === 'gender' && (
        <div>
          {/* Big gender tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            {([...genderStats, ...(unknownGender > 0 ? [{ gender: 'Unknown', total: unknownGender }] : [])]).map(g => {
              const GC: Record<string, { fg: string; bg: string; icon: string }> = {
                Male:    { fg: '#2563eb', bg: 'rgba(37,99,235,0.08)',   icon: '👦' },
                Female:  { fg: '#db2777', bg: 'rgba(219,39,119,0.08)', icon: '👧' },
                Other:   { fg: '#7c3aed', bg: 'rgba(124,58,237,0.08)', icon: '🧑' },
                Unknown: { fg: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: '❓' },
              };
              const { fg, bg, icon } = GC[g.gender] ?? { fg: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: '❓' };
              return (
                <div key={g.gender} style={{ background: bg, border: `2px solid ${fg}30`, borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--m)', marginBottom: 6 }}>{g.gender}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'Sora,sans-serif', color: fg, lineHeight: 1, marginBottom: 4 }}>{g.total}</div>
                  <div style={{ fontSize: 12, color: fg, fontWeight: 700 }}>
                    {paidRows.length ? Math.round(g.total / paidRows.length * 100) : 0}%
                  </div>
                  {/* mini bar */}
                  <div style={{ marginTop: 10, height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${paidRows.length ? Math.round(g.total / paidRows.length * 100) : 0}%`, height: '100%', background: fg, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <ChartCard title="⚧ Gender Distribution" tall>
              <CJSCanvas id="genderDoughnut" />
            </ChartCard>
            <ChartCard title="📊 Gender Count" tall>
              <CJSCanvas id="genderBarHoriz" />
            </ChartCard>
          </div>

          <SectionHead title="Gender × Class Table" note="Paid only" />
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th style={{ color: '#2563eb' }}>👦 Male</th>
                  <th style={{ color: '#db2777' }}>👧 Female</th>
                  <th style={{ color: '#7c3aed' }}>🧑 Other</th>
                  <th>Total</th>
                  <th style={{ minWidth: 160 }}>Gender Split</th>
                </tr>
              </thead>
              <tbody>
                {genderClassStats.map(c => {
                  const mPct = c.total > 0 ? Math.round(c.byGender.Male / c.total * 100)   : 0;
                  const fPct = c.total > 0 ? Math.round(c.byGender.Female / c.total * 100) : 0;
                  const oPct = c.total > 0 ? Math.round(c.byGender.Other / c.total * 100)  : 0;
                  return (
                    <tr key={c.cls}>
                      <td><span style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{c.cls}</span></td>
                      <td style={{ color: '#2563eb', fontWeight: 700 }}>{c.byGender.Male || 0}</td>
                      <td style={{ color: '#db2777', fontWeight: 700 }}>{c.byGender.Female || 0}</td>
                      <td style={{ color: '#7c3aed', fontWeight: 700 }}>{c.byGender.Other || 0}</td>
                      <td style={{ fontWeight: 800, fontFamily: 'Sora,sans-serif' }}>{c.total}</td>
                      <td>
                        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
                          {mPct > 0 && <div style={{ width: `${mPct}%`, background: '#2563eb', borderRadius: '4px 0 0 4px' }} title={`Male ${mPct}%`} />}
                          {fPct > 0 && <div style={{ width: `${fPct}%`, background: '#db2777' }} title={`Female ${fPct}%`} />}
                          {oPct > 0 && <div style={{ width: `${oPct}%`, background: '#7c3aed', borderRadius: '0 4px 4px 0' }} title={`Other ${oPct}%`} />}
                          {(100 - mPct - fPct - oPct) > 0 && <div style={{ flex: 1, background: 'var(--bd)', borderRadius: '0 4px 4px 0' }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--m)' }}>
                          {mPct > 0 && <span style={{ color: '#2563eb' }}>{mPct}% M</span>}
                          {fPct > 0 && <span style={{ color: '#db2777' }}>{fPct}% F</span>}
                          {oPct > 0 && <span style={{ color: '#7c3aed' }}>{oPct}% O</span>}
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

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PAYMENT                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeSection === 'payment' && (
        <div>
          {/* Revenue tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'var(--card)', border: '2px solid rgba(79,70,229,0.2)', borderRadius: 14, padding: '18px 20px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>🇮🇳 INR Collections</div>
              <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Sora,sans-serif', color: 'var(--acc)', marginBottom: 8 }}>₹{fmtA(inrRev)}</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--m)' }}>
                <span>📊 {inrPaid.length} transactions</span>
                <span>📈 Avg ₹{inrPaid.length ? fmtA(Math.round(inrRev / inrPaid.length)) : '0'}</span>
                <span>🎯 {conv}% conv</span>
              </div>
            </div>
            <div style={{ background: 'var(--card)', border: '2px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: '18px 20px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--m)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>🌐 USD Collections</div>
              <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Sora,sans-serif', color: '#22c55e', marginBottom: 8 }}>${fmtA(usdRev)}</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--m)' }}>
                <span>📊 {usdPaid.length} transactions</span>
                <span>📈 Avg ${usdPaid.length ? fmtA(Math.round(usdRev / usdPaid.length)) : '0'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <ChartCard title="🏦 Gateway — Paid vs Dropped" tall>
              <CJSCanvas id="gwBar" />
            </ChartCard>
            <ChartCard title="💰 Revenue by Gateway" tall>
              <CJSCanvas id="gwRevBar" />
            </ChartCard>
          </div>

          <SectionHead title="Payment Gateway Breakdown" note="All attempts" />
          <div className="tbl-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Gateway</th>
                  <th>Attempts</th>
                  <th>Paid</th>
                  <th>Dropped</th>
                  <th>Revenue</th>
                  <th>Conv%</th>
                  <th style={{ minWidth: 120 }}>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {gatewayStats.length === 0
                  ? <tr><td colSpan={7} className="table-empty">No gateway data</td></tr>
                  : gatewayStats.map(g => {
                    const convPct = g.attempts ? Math.round(g.paid / g.attempts * 100) : 0;
                    return (
                      <tr key={g.gw}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GW_COLORS[g.gw] ?? '#94a3b8', flexShrink: 0 }} />
                            <span className="gw-tag">{g.gw}</span>
                          </div>
                        </td>
                        <td><InlineBar value={g.attempts} max={Math.max(...gatewayStats.map(x => x.attempts))} color="var(--acc)" /></td>
                        <td><span style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>{g.paid}</span></td>
                        <td><span style={{ color: '#ef4444', fontWeight: 600 }}>{g.attempts - g.paid}</span></td>
                        <td><span style={{ fontWeight: 700, fontFamily: 'Sora,sans-serif' }}>₹{fmtA(g.rev)}</span></td>
                        <td>
                          <span style={{
                            fontSize: 13, fontWeight: 800, color: convPct >= 70 ? '#10b981' : convPct >= 40 ? '#f59e0b' : '#ef4444',
                          }}>{convPct}%</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--bd)', borderRadius: 3, overflow: 'hidden', minWidth: 70 }}>
                              <div style={{ width: `${convPct}%`, height: '100%', background: convPct >= 70 ? '#10b981' : convPct >= 40 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Discount analysis */}
          <SectionHead title="🏷️ Discount Code Analysis" note="All registrations" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <KPI icon="🏷️" label="Codes Used"     val={discountUsed}           color="#ec4899" sub={`${rows.length ? Math.round(discountUsed / rows.length * 100) : 0}% of registrations`} />
            <KPI icon="💸" label="Total Saved"     val={`₹${fmtA(discountSaved)}`} color="#f59e0b" sub="total discount given" />
            <KPI icon="📊" label="Avg Discount"    val={`₹${discountUsed ? fmtA(Math.round(discountSaved / discountUsed)) : 0}`} color="#8b5cf6" sub="per code used" />
          </div>
          {(() => {
            const codeMap: Record<string, { count: number; saved: number; paid: number }> = {};
            rows.forEach(r => {
              if (!r.discount_code) return;
              if (!codeMap[r.discount_code]) codeMap[r.discount_code] = { count: 0, saved: 0, paid: 0 };
              codeMap[r.discount_code].count++;
              codeMap[r.discount_code].saved += r.discount_amount ?? 0;
              if (r.payment_status === 'paid') codeMap[r.discount_code].paid++;
            });
            const sorted = Object.entries(codeMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
            if (!sorted.length) return null;
            return (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Code</th><th>Used</th><th>Paid</th><th>Total Saved</th><th>Avg Saved</th></tr></thead>
                  <tbody>
                    {sorted.map(([code, d]) => (
                      <tr key={code}>
                        <td><code style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1px solid rgba(245,158,11,0.2)' }}>{code}</code></td>
                        <td><span style={{ fontWeight: 700 }}>{d.count}</span></td>
                        <td><span style={{ color: '#10b981', fontWeight: 700 }}>{d.paid}</span></td>
                        <td><span style={{ color: '#ec4899', fontWeight: 700 }}>₹{fmtA(d.saved)}</span></td>
                        <td style={{ color: 'var(--m)', fontSize: 12 }}>₹{d.count ? fmtA(Math.round(d.saved / d.count)) : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
