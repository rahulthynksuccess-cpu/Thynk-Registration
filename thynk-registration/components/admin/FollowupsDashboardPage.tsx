'use client';
// components/admin/FollowupsDashboardPage.tsx
// Central place to SEE every follow-up that's been set (for both Consultants
// and Schools) and to set/update the next follow-up date from one screen,
// instead of having to open each consultant/school individually.

import React, { useMemo, useState } from 'react';
import FollowupModal from './FollowupModal';

type Row = Record<string, any>;

const todayStr = () => new Date().toISOString().slice(0, 10);

function daysUntil(dateStr: string) {
  const today = new Date(todayStr() + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function FollowupsDashboardPage({
  schools, consultants, showToast, onRefresh,
}: {
  schools: Row[];
  consultants: Row[];
  showToast: (t: string, i?: string) => void;
  onRefresh: () => void;
}) {
  const [typeFilter, setTypeFilter]     = useState<'all' | 'school' | 'consultant'>('all');
  const [dueFilter, setDueFilter]       = useState<'upcoming' | 'overdue' | 'unset' | 'all'>('upcoming');
  const [consultantFilter, setConsultantFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [active, setActive]             = useState<Row | null>(null);

  const combined: Row[] = useMemo(() => {
    const s = schools.map(x => ({
      type: 'school', id: x.id, name: x.name, code: x.school_code,
      next_followup_date: x.next_followup_date, last_followup_at: x.last_followup_at,
      last_followup_comment: x.last_followup_comment, last_followup_by: x.last_followup_by,
      consultant_id: x.consultant_id || null, consultant_name: x.consultant_name || null,
    }));
    const c = consultants.map(x => ({
      type: 'consultant', id: x.id, name: x.name || x.email, code: x.consultant_code,
      next_followup_date: x.next_followup_date, last_followup_at: x.last_followup_at,
      last_followup_comment: x.last_followup_comment, last_followup_by: x.last_followup_by,
      rejected: x.status === 'rejected',
      // A consultant isn't "assigned to" themselves — this column is for
      // schools. Kept null here so the table shows a dash for consultant rows.
      consultant_id: null, consultant_name: null,
    }));
    return [...s, ...c];
  }, [schools, consultants]);

  const filtered = useMemo(() => {
    let list = combined;
    if (typeFilter !== 'all') list = list.filter(r => r.type === typeFilter);
    if (dueFilter === 'upcoming') list = list.filter(r => !!r.next_followup_date);
    else if (dueFilter === 'overdue') list = list.filter(r => r.next_followup_date && daysUntil(r.next_followup_date) < 0);
    else if (dueFilter === 'unset') list = list.filter(r => !r.next_followup_date);
    if (consultantFilter) {
      // Show schools assigned to this consultant, plus the consultant's own row.
      list = list.filter(r => r.consultant_id === consultantFilter || (r.type === 'consultant' && r.id === consultantFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => {
      if (a.next_followup_date && b.next_followup_date) return a.next_followup_date.localeCompare(b.next_followup_date);
      if (a.next_followup_date) return -1;
      if (b.next_followup_date) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [combined, typeFilter, dueFilter, consultantFilter, search]);

  const overdueCount  = combined.filter(r => r.next_followup_date && daysUntil(r.next_followup_date) < 0).length;
  const upcomingCount = combined.filter(r => r.next_followup_date && daysUntil(r.next_followup_date) >= 0).length;
  const unsetCount    = combined.filter(r => !r.next_followup_date).length;

  const PILL = (activeSel: boolean, color: string): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1.5px solid ${activeSel ? color : 'var(--bd)'}`,
    background: activeSel ? `${color}18` : 'transparent',
    color: activeSel ? color : 'var(--m)', whiteSpace: 'nowrap',
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Follow-ups <span>Consultants &amp; Schools</span></h1>
          <p>
            {overdueCount > 0 && <span style={{ color: '#ef4444', fontWeight: 700, marginRight: 12 }}>🔴 {overdueCount} overdue</span>}
            <span style={{ color: '#f59e0b', fontWeight: 600, marginRight: 12 }}>🟡 {upcomingCount} upcoming</span>
            <span style={{ color: 'var(--m)' }}>⚪ {unsetCount} not set</span>
          </p>
        </div>
        <div className="topbar-right">
          <input
            placeholder="Search name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: '1.5px solid var(--bd)', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', color: 'var(--text)', background: 'var(--card)', minWidth: 220 }}
          />
          <button className="btn btn-outline" onClick={onRefresh}>🔄 Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <button style={PILL(dueFilter === 'overdue', '#ef4444')} onClick={() => setDueFilter('overdue')}>🔴 Overdue</button>
        <button style={PILL(dueFilter === 'upcoming', '#f59e0b')} onClick={() => setDueFilter('upcoming')}>🟡 Upcoming</button>
        <button style={PILL(dueFilter === 'unset', '#64748b')} onClick={() => setDueFilter('unset')}>⚪ Not Set</button>
        <button style={PILL(dueFilter === 'all', 'var(--acc)')} onClick={() => setDueFilter('all')}>All</button>
        <span style={{ width: 1, background: 'var(--bd)', margin: '0 4px' }} />
        <button style={PILL(typeFilter === 'all', 'var(--acc)')} onClick={() => setTypeFilter('all')}>Everyone</button>
        <button style={PILL(typeFilter === 'school', '#4f46e5')} onClick={() => setTypeFilter('school')}>🏫 Schools</button>
        <button style={PILL(typeFilter === 'consultant', '#4f46e5')} onClick={() => setTypeFilter('consultant')}>🤝 Consultants</button>
        <span style={{ width: 1, background: 'var(--bd)', margin: '0 4px' }} />
        <select
          value={consultantFilter}
          onChange={e => setConsultantFilter(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1.5px solid ${consultantFilter ? '#4f46e5' : 'var(--bd)'}`, background: consultantFilter ? 'rgba(79,70,229,.08)' : 'transparent', color: consultantFilter ? '#4f46e5' : 'var(--m)', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}
        >
          <option value="">🤝 Filter by Consultant…</option>
          {consultants.map(c => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
        </select>
        {consultantFilter && (
          <button onClick={() => setConsultantFilter('')}
            style={{ padding: '4px 10px', borderRadius: 20, border: '1.5px solid var(--bd)', fontSize: 11, color: 'var(--m)', background: 'transparent', cursor: 'pointer' }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Name</th><th>Assigned Consultant</th><th>Next Follow-up</th><th>Last Comment</th><th>Logged By</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="table-empty">Nothing matches these filters.</td></tr>
            )}
            {filtered.map(r => {
              const dOut = r.next_followup_date ? daysUntil(r.next_followup_date) : null;
              const overdue = dOut !== null && dOut < 0;
              const soon    = dOut !== null && dOut >= 0 && dOut <= 3;
              return (
                <tr key={`${r.type}-${r.id}`}>
                  <td><span className="badge badge-paid" style={{ background: r.type === 'school' ? 'rgba(79,70,229,.1)' : 'rgba(139,92,246,.1)', color: r.type === 'school' ? '#4f46e5' : '#8b5cf6' }}>{r.type === 'school' ? '🏫 School' : '🤝 Consultant'}</span></td>
                  <td>
                    <strong>{r.name}</strong>{r.code ? <span style={{ color: 'var(--m)', fontSize: 11 }}> · {r.code}</span> : null}
                    {r.rejected && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#991b1b', background: '#fee2e2', borderRadius: 20, padding: '1px 7px' }}>Rejected</span>}
                  </td>
                  <td>
                    {r.type === 'school'
                      ? (r.consultant_name
                          ? <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.consultant_name}</span>
                          : <span style={{ color: 'var(--m)', fontStyle: 'italic' }}>Unassigned</span>)
                      : <span style={{ color: 'var(--m)' }}>—</span>}
                  </td>
                  <td>
                    {r.next_followup_date
                      ? <span style={{ fontWeight: 700, color: overdue ? '#ef4444' : soon ? '#b45309' : 'var(--text)' }}>
                          {fmtDate(r.next_followup_date)} {overdue ? `(${Math.abs(dOut!)}d overdue)` : soon ? '(soon)' : ''}
                        </span>
                      : <span style={{ color: 'var(--m)' }}>Not set</span>}
                  </td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.last_followup_comment || ''}>
                    {r.last_followup_comment || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--m)' }}>
                    {r.last_followup_by ? <>{r.last_followup_by}<br /><span style={{ fontSize: 10.5 }}>{fmtDateTime(r.last_followup_at)}</span></> : '—'}
                  </td>
                  <td>
                    <button onClick={() => setActive(r)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid rgba(245,158,11,.35)', background: 'rgba(245,158,11,.06)', color: '#b45309', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      📅 {r.next_followup_date ? 'Update' : 'Set'} Follow-up
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active && (
        <FollowupModal
          entityType={active.type}
          entityId={active.id}
          entityName={active.name}
          onClose={() => setActive(null)}
          showToast={showToast}
          onSaved={() => onRefresh()}
        />
      )}
    </>
  );
}
