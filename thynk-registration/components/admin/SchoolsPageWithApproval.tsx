'use client';
// components/admin/SchoolsPageWithApproval.tsx
// Replaces the Schools section in admin/page.tsx
// Has two tabs: Approval Queue + Approved Schools
//
// Usage in admin/page.tsx — replace the Schools page block with:
//
//   import AdminApprovalQueue from '@/components/admin/AdminApprovalQueue';
//   import { SchoolsPageWithApproval } from '@/components/admin/SchoolsPageWithApproval';
//
//   {/* ── SCHOOLS ─────────────────────────────────────────────── */}
//   <div className={`page${activePage === 'schools' ? ' active' : ''}`}>
//     <SchoolsPageWithApproval
//       schools={schools}
//       programs={programs}
//       isSuperAdmin={isSuperAdmin}
//       BACKEND={BACKEND}
//       authHeaders={authHeaders}
//       onEdit={s => { loadPrograms(); setSchoolForm(s); }}
//       onRefresh={loadSchools}
//       showToast={showToast}
//     />
//   </div>

import React, { useState } from 'react';
import AdminApprovalQueue from '@/components/admin/AdminApprovalQueue';

type Row = Record<string, any>;

const SS: React.CSSProperties = {
  border: '1.5px solid var(--bd)',
  borderRadius: 10,
  padding: '7px 14px',
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--card)',
  cursor: 'pointer',
  appearance: 'none' as any,
};

// ── Main component ─────────────────────────────────────────────────
export function SchoolsPageWithApproval({
  schools,
  programs,
  isSuperAdmin,
  BACKEND,
  authHeaders,
  onEdit,
  onRefresh,
  showToast,
}: {
  schools:      Row[];
  programs:     Row[];
  isSuperAdmin: boolean;
  BACKEND:      string;
  authHeaders:  () => HeadersInit;
  onEdit:       (s: Row) => void;
  onRefresh:    () => void;
  showToast:    (t: string, i?: string) => void;
}) {
  const [tab, setTab] = useState<'queue' | 'approved'>('queue');

  // Schools not yet approved go to the queue
  const pendingSchools    = schools.filter(s => s.status && s.status !== 'approved');
  // Only truly pending_approval ones need urgent attention (badge count)
  const pendingApprovalCount = schools.filter(s => s.status === 'pending_approval').length;
  const registeredCount      = schools.filter(s => s.status === 'registered').length;
  // Schools that are approved OR have no status column yet (legacy rows before migration)
  const approvedSchools = schools.filter(s => s.status === 'approved' || !s.status);

  const TAB: (active: boolean) => React.CSSProperties = active => ({
    padding: '8px 18px',
    borderRadius: 10,
    border: '1.5px solid',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background:  active ? 'var(--acc)' : 'transparent',
    borderColor: active ? 'var(--acc)' : 'var(--bd)',
    color:       active ? '#fff'       : 'var(--m)',
    transition:  'all .12s',
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Schools <span>Management</span></h1>
          <p>
            {pendingApprovalCount > 0 && (
              <span style={{ color: '#ef4444', fontWeight: 700, marginRight: 8 }}>
                🔴 {pendingApprovalCount} need{pendingApprovalCount === 1 ? 's' : ''} approval
              </span>
            )}
            {registeredCount > 0 && (
              <span style={{ color: '#f59e0b', fontWeight: 700, marginRight: 12 }}>
                · ⚠️ {registeredCount} newly registered
              </span>
            )}
            {approvedSchools.length} approved school{approvedSchools.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="topbar-right">
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={TAB(tab === 'queue')} onClick={() => setTab('queue')}>
              {pendingApprovalCount > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 20,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px',
                  marginRight: 6, display: 'inline-block',
                }}>
                  {pendingApprovalCount}
                </span>
              )}
              {registeredCount > 0 && pendingApprovalCount === 0 && (
                <span style={{
                  background: '#f59e0b', color: '#fff', borderRadius: 20,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px',
                  marginRight: 6, display: 'inline-block',
                }}>
                  {registeredCount}
                </span>
              )}
              Approval Queue
            </button>
            <button style={TAB(tab === 'approved')} onClick={() => setTab('approved')}>
              Approved Schools
            </button>
          </div>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => onEdit({})}>
              + Add School
            </button>
          )}
        </div>
      </div>

      {tab === 'queue' && (
        <AdminApprovalQueue
          pendingSchools={pendingSchools}
          programs={programs}
          BACKEND={BACKEND}
          authHeaders={authHeaders}
          onRefresh={onRefresh}
          showToast={showToast}
        />
      )}

      {tab === 'approved' && (
        <SchoolsTableWithStatus
          schools={approvedSchools}
          programs={programs}
          isSuperAdmin={isSuperAdmin}
          onEdit={onEdit}
        />
      )}
    </>
  );
}

// ── Approved schools table ─────────────────────────────────────────
export function SchoolsTableWithStatus({
  schools,
  programs,
  isSuperAdmin,
  onEdit,
}: {
  schools:      Row[];
  programs:     Row[];
  isSuperAdmin: boolean;
  onEdit:       (s: Row) => void;
}) {
  const [filterProgram, setFilterProgram] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterState,   setFilterState]   = useState('');
  const [filterCity,    setFilterCity]    = useState('');

  const fmtR = (p: number) => {
    const v = p / 100;
    return isNaN(v) ? '0' : v.toLocaleString('en-IN');
  };

  const countries = [...new Set(schools.map(s => s.country).filter(Boolean))].sort();
  const states    = [...new Set(
    schools
      .filter(s => !filterCountry || s.country === filterCountry)
      .map(s => s.state).filter(Boolean)
  )].sort();
  const cities    = [...new Set(
    schools
      .filter(s => (!filterCountry || s.country === filterCountry) && (!filterState || s.state === filterState))
      .map(s => s.city).filter(Boolean)
  )].sort();

  const filtered = schools.filter(s => {
    const prog = programs.find(p => p.id === s.project_id) ?? programs.find(p => p.slug === s.project_slug);
    if (filterProgram && prog?.id !== filterProgram) return false;
    if (filterCountry && s.country !== filterCountry) return false;
    if (filterState   && s.state   !== filterState)   return false;
    if (filterCity    && s.city    !== filterCity)     return false;
    return true;
  });

  return (
    <>
      <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select style={{ ...SS, width: 'auto', minWidth: 140 }} value={filterProgram} onChange={e => setFilterProgram(e.target.value)}>
          <option value="">All Programs</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 130 }} value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setFilterState(''); setFilterCity(''); }}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 130 }} value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); }}>
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...SS, width: 'auto', minWidth: 120 }} value={filterCity} onChange={e => setFilterCity(e.target.value)}>
          <option value="">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--m)', marginLeft: 'auto' }}>
          {filtered.length} of {schools.length}
        </span>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>School Name</th>
              <th>Location</th>
              <th>Program</th>
              <th>Price</th>
              <th>Discount Code</th>
              <th>Registration URL</th>
              <th>Reg Active</th>
              <th>Status</th>
              {isSuperAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="table-empty">No schools match the selected filters.</td></tr>
            ) : (
              filtered.map(s => {
                const prog         = programs.find(p => p.id === s.project_id) ?? programs.find(p => p.slug === s.project_slug);
                const regUrl       = `${prog?.base_url || 'https://www.thynksuccess.com'}/registration/${s.project_slug ?? ''}/?school=${s.school_code}`;
                const schoolCurr   = s.pricing?.[0]?.currency ?? 'INR';
                const priceFmt     = schoolCurr === 'USD'
                  ? `$${fmtR(s.pricing?.[0]?.base_amount ?? 0)}`
                  : `₹${fmtR(s.pricing?.[0]?.base_amount ?? 0)}`;
                const status       = s.status || 'approved';
                const statusClass  = status === 'approved' ? 'badge-paid' : status === 'pending_approval' ? 'badge-initiated' : 'badge-pending';
                const statusLabel  = status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Pending' : 'Registered';

                return (
                  <tr key={s.id}>
                    <td>
                      <code style={{ background: 'var(--acc3)', color: 'var(--acc)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                        {s.school_code}
                      </code>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {s.name}
                      {s.org_name && s.org_name !== s.name && (
                        <div style={{ fontSize: 11, color: 'var(--m)', fontWeight: 400 }}>{s.org_name}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{prog?.name ?? s.project_slug ?? '—'}</td>
                    <td><span className="amt">{priceFmt}</span></td>
                    <td>
                      <code style={{ background: 'var(--orange2)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>
                        {s.discount_code || s.school_code?.toUpperCase()}
                      </code>
                    </td>
                    <td>
                      <a href={regUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', fontSize: 11, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        🔗 {regUrl.replace('https://', '').slice(0, 40)}
                      </a>
                    </td>
                    <td>
                      <span className={`badge ${s.is_registration_active ? 'badge-paid' : 'badge-cancelled'}`}>
                        {s.is_registration_active ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{statusLabel}</span>
                    </td>
                    {isSuperAdmin && (
                      <td>
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onEdit(s)}>
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
