'use client';
/**
 * components/admin/ManageSchool.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk school status management page.
 *
 * Features:
 *  • Cascading checkbox dropdowns: Country → State → City → School
 *  • Per-school toggles for "Is Active" and "Registration Open"
 *  • Bulk actions: activate all / deactivate all / open all / close all
 *  • Pending-edit tracking — changes are local until "Save Changes" is clicked
 *  • On save: PATCH /api/admin/schools for each changed school
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

/* ── Checkbox Dropdown ──────────────────────────────────────────────────────── */
function CheckDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label:    string;
  options:  string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const allSelected = options.length > 0 && selected.length === options.length;

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  function toggleAll() {
    onChange(allSelected ? [] : [...options]);
  }

  const label_text = selected.length === 0
    ? `All ${label}s`
    : selected.length === options.length
    ? `All ${label}s (${options.length})`
    : selected.length === 1
    ? selected[0]
    : `${selected.length} ${label}s`;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          border: '1.5px solid var(--bd)', background: 'var(--card)',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: 'var(--text)', width: '100%', justifyContent: 'space-between',
          fontFamily: 'DM Sans,sans-serif',
        }}
      >
        <span>{label_text}</span>
        <span style={{ fontSize: 10, color: 'var(--m)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 999,
          background: 'var(--card)', border: '1.5px solid var(--bd)',
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          minWidth: 220, maxHeight: 300, overflowY: 'auto',
          fontFamily: 'DM Sans,sans-serif',
        }}>
          {/* Select all */}
          <div
            onClick={toggleAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--bd)',
              background: 'var(--bg)', fontSize: 12, fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              readOnly
              checked={allSelected}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--acc)' }}
            />
            <span>Select All ({options.length})</span>
            {selected.length > 0 && (
              <span
                onClick={e => { e.stopPropagation(); onChange([]); }}
                style={{ marginLeft: 'auto', color: 'var(--acc)', fontSize: 11, cursor: 'pointer' }}
              >
                Clear
              </span>
            )}
          </div>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => toggle(opt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                background: selected.includes(opt) ? 'var(--acc3)' : 'transparent',
                borderBottom: '1px solid rgba(0,0,0,.04)',
              }}
            >
              <input
                type="checkbox"
                readOnly
                checked={selected.includes(opt)}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--acc)' }}
              />
              <span style={{ color: selected.includes(opt) ? 'var(--acc)' : 'var(--text)', fontWeight: selected.includes(opt) ? 600 : 400 }}>
                {opt}
              </span>
            </div>
          ))}
          {options.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--m)' }}>No options</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Toggle Switch ──────────────────────────────────────────────────────────── */
function Toggle({
  checked,
  onChange,
  colorOn = '#10b981',
  label,
}: {
  checked:  boolean;
  onChange: (v: boolean) => void;
  colorOn?: string;
  label:    string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: checked ? colorOn : '#d1d5db',
          cursor: 'pointer', position: 'relative', transition: 'background .2s',
          flexShrink: 0,
        }}
        title={`${label}: ${checked ? 'ON' : 'OFF'} — click to toggle`}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </button>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: checked ? colorOn : 'var(--m)',
        fontFamily: 'DM Sans,sans-serif',
      }}>
        {checked ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────────── */
export function ManageSchool({
  schools,
  programs,
  isSuperAdmin,
  onRefresh,
  showToast,
}: {
  schools:      Row[];
  programs:     Row[];
  isSuperAdmin: boolean;
  onRefresh:    () => void;
  showToast:    (msg: string, icon?: string) => void;
}) {
  // ── Local edits: schoolId → { is_active, is_registration_active }
  const [edits, setEdits] = useState<Record<string, { is_active: boolean; is_registration_active: boolean }>>({});
  const [saving, setSaving] = useState(false);

  // ── Filters
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selStates,    setSelStates]    = useState<string[]>([]);
  const [selCities,    setSelCities]    = useState<string[]>([]);
  const [selSchools,   setSelSchools]   = useState<string[]>([]);

  // ── Derive filter options from school list
  const allCountries = useMemo(() =>
    [...new Set(schools.map(s => s.country).filter(Boolean))].sort(), [schools]);

  const allStates = useMemo(() => {
    const base = selCountries.length > 0
      ? schools.filter(s => selCountries.includes(s.country))
      : schools;
    return [...new Set(base.map(s => s.state).filter(Boolean))].sort();
  }, [schools, selCountries]);

  const allCities = useMemo(() => {
    let base = schools;
    if (selCountries.length > 0) base = base.filter(s => selCountries.includes(s.country));
    if (selStates.length > 0)    base = base.filter(s => selStates.includes(s.state));
    return [...new Set(base.map(s => s.city).filter(Boolean))].sort();
  }, [schools, selCountries, selStates]);

  const allSchoolNames = useMemo(() => {
    let base = schools;
    if (selCountries.length > 0) base = base.filter(s => selCountries.includes(s.country));
    if (selStates.length > 0)    base = base.filter(s => selStates.includes(s.state));
    if (selCities.length > 0)    base = base.filter(s => selCities.includes(s.city));
    return [...new Set(base.map(s => s.name).filter(Boolean))].sort();
  }, [schools, selCountries, selStates, selCities]);

  // ── Filtered school list (what's shown in the table)
  const filtered = useMemo(() => {
    let base = [...schools];
    if (selCountries.length > 0) base = base.filter(s => selCountries.includes(s.country));
    if (selStates.length > 0)    base = base.filter(s => selStates.includes(s.state));
    if (selCities.length > 0)    base = base.filter(s => selCities.includes(s.city));
    if (selSchools.length > 0)   base = base.filter(s => selSchools.includes(s.name));
    return base.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [schools, selCountries, selStates, selCities, selSchools]);

  // ── Helpers to get current value (edited or original)
  function getActive(s: Row): boolean {
    return edits[s.id] !== undefined ? edits[s.id].is_active : (s.is_active !== false);
  }
  function getRegOpen(s: Row): boolean {
    return edits[s.id] !== undefined ? edits[s.id].is_registration_active : (s.is_registration_active === true);
  }

  function setEdit(schoolId: string, field: 'is_active' | 'is_registration_active', value: boolean) {
    setEdits(prev => {
      const school = schools.find(s => s.id === schoolId);
      if (!school) return prev;
      const current = prev[schoolId] ?? {
        is_active:              school.is_active !== false,
        is_registration_active: school.is_registration_active === true,
      };
      const next = { ...current, [field]: value };
      // If reverted to original, remove from edits
      const origActive  = school.is_active !== false;
      const origRegOpen = school.is_registration_active === true;
      if (next.is_active === origActive && next.is_registration_active === origRegOpen) {
        const { [schoolId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [schoolId]: next };
    });
  }

  // ── Bulk actions on filtered list
  function bulkSet(field: 'is_active' | 'is_registration_active', value: boolean) {
    setEdits(prev => {
      const next = { ...prev };
      filtered.forEach(s => {
        const current = next[s.id] ?? {
          is_active:              s.is_active !== false,
          is_registration_active: s.is_registration_active === true,
        };
        const updated = { ...current, [field]: value };
        const origActive  = s.is_active !== false;
        const origRegOpen = s.is_registration_active === true;
        if (updated.is_active === origActive && updated.is_registration_active === origRegOpen) {
          delete next[s.id];
        } else {
          next[s.id] = updated;
        }
      });
      return next;
    });
  }

  const pendingCount = Object.keys(edits).length;

  // ── Save changes
  async function saveChanges() {
    if (pendingCount === 0) return;
    setSaving(true);
    let successCount = 0;
    let failCount    = 0;

    for (const [schoolId, changes] of Object.entries(edits)) {
      try {
        const res = await authFetch(`${BACKEND}/api/admin/schools`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            id:                     schoolId,
            is_active:              changes.is_active,
            is_registration_active: changes.is_registration_active,
          }),
        });
        if (res.ok) successCount++;
        else        failCount++;
      } catch {
        failCount++;
      }
    }

    setSaving(false);

    if (failCount === 0) {
      showToast(`✅ Saved ${successCount} school${successCount !== 1 ? 's' : ''} successfully`);
      setEdits({});
      onRefresh();
    } else {
      showToast(`⚠️ ${successCount} saved, ${failCount} failed — please try again`, '⚠️');
    }
  }

  // ── Discard all local edits
  function discardChanges() {
    setEdits({});
  }

  // ── Stats for header
  const activeCount  = filtered.filter(s => getActive(s)).length;
  const regOpenCount = filtered.filter(s => getRegOpen(s)).length;

  return (
    <div style={{ fontFamily: 'DM Sans,sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-left">
          <h1>Manage <span>Schools</span></h1>
          <p>
            {filtered.length} school{filtered.length !== 1 ? 's' : ''} shown
            &nbsp;·&nbsp; {activeCount} active
            &nbsp;·&nbsp; {regOpenCount} registration open
          </p>
        </div>
        <div className="topbar-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pendingCount > 0 && (
            <>
              <button
                className="btn"
                onClick={discardChanges}
                style={{ border: '1.5px solid var(--bd)', background: 'transparent', color: 'var(--m)' }}
              >
                Discard
              </button>
              <button
                className="btn btn-primary"
                onClick={saveChanges}
                disabled={saving}
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '⏳ Saving…' : `💾 Save Changes (${pendingCount})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 14,
        padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '1px', marginRight: 4 }}>
          Filter:
        </span>
        <CheckDropdown
          label="Country"
          options={allCountries}
          selected={selCountries}
          onChange={v => { setSelCountries(v); setSelStates([]); setSelCities([]); setSelSchools([]); }}
        />
        <CheckDropdown
          label="State"
          options={allStates}
          selected={selStates}
          onChange={v => { setSelStates(v); setSelCities([]); setSelSchools([]); }}
        />
        <CheckDropdown
          label="City"
          options={allCities}
          selected={selCities}
          onChange={v => { setSelCities(v); setSelSchools([]); }}
        />
        <CheckDropdown
          label="School"
          options={allSchoolNames}
          selected={selSchools}
          onChange={setSelSchools}
        />
        {(selCountries.length > 0 || selStates.length > 0 || selCities.length > 0 || selSchools.length > 0) && (
          <button
            onClick={() => { setSelCountries([]); setSelStates([]); setSelCities([]); setSelSchools([]); }}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1.5px solid #ef4444', background: 'rgba(239,68,68,.07)',
              color: '#ef4444', cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Bulk Action Bar ─────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 12,
          padding: '12px 18px', marginBottom: 16,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', marginRight: 4 }}>
            Bulk ({filtered.length}):
          </span>
          <button onClick={() => bulkSet('is_active', true)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1.5px solid #10b981', background: 'rgba(16,185,129,.08)', color: '#10b981', cursor: 'pointer' }}>
            ✓ Activate All
          </button>
          <button onClick={() => bulkSet('is_active', false)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1.5px solid #ef4444', background: 'rgba(239,68,68,.08)', color: '#ef4444', cursor: 'pointer' }}>
            ✗ Deactivate All
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--bd)', margin: '0 4px' }} />
          <button onClick={() => bulkSet('is_registration_active', true)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1.5px solid #6366f1', background: 'rgba(99,102,241,.08)', color: '#6366f1', cursor: 'pointer' }}>
            🔓 Open Registration All
          </button>
          <button onClick={() => bulkSet('is_registration_active', false)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1.5px solid #94a3b8', background: 'rgba(148,163,184,.08)', color: '#64748b', cursor: 'pointer' }}>
            🔒 Close Registration All
          </button>
        </div>
      )}

      {/* ── Pending changes notice ──────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div style={{
          background: 'rgba(245,158,11,.08)', border: '1.5px solid rgba(245,158,11,.3)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          fontSize: 12, fontWeight: 600, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ⚠️ You have <strong>{pendingCount}</strong> unsaved change{pendingCount !== 1 ? 's' : ''}.
          Click <strong>Save Changes</strong> to apply, or <strong>Discard</strong> to revert.
        </div>
      )}

      {/* ── School Table ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px', background: 'var(--card)',
          border: '1.5px solid var(--bd)', borderRadius: 14,
          color: 'var(--m)', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
          <div>No schools match the selected filters.</div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>School</th>
                <th>Program</th>
                <th>Location</th>
                <th>Code</th>
                <th style={{ textAlign: 'center', minWidth: 120 }}>Is Active</th>
                <th style={{ textAlign: 'center', minWidth: 140 }}>Registration Open</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const prog       = programs.find((p: Row) => p.id === s.project_id || p.slug === s.project_slug);
                const isActive   = getActive(s);
                const isRegOpen  = getRegOpen(s);
                const hasEdit    = !!edits[s.id];
                const origActive  = s.is_active !== false;
                const origRegOpen = s.is_registration_active === true;

                return (
                  <tr
                    key={s.id}
                    style={{
                      background: hasEdit ? 'rgba(245,158,11,.04)' : undefined,
                      borderLeft: hasEdit ? '3px solid #f59e0b' : '3px solid transparent',
                    }}
                  >
                    {/* School name */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                      {s.org_name && s.org_name !== s.name && (
                        <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 2 }}>{s.org_name}</div>
                      )}
                      {hasEdit && (
                        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 3, fontWeight: 600 }}>
                          ● unsaved changes
                        </div>
                      )}
                    </td>

                    {/* Program */}
                    <td style={{ fontSize: 12, color: 'var(--m)' }}>
                      {prog?.name ?? s.project_slug ?? '—'}
                    </td>

                    {/* Location */}
                    <td style={{ fontSize: 12, color: 'var(--m)' }}>
                      {[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}
                    </td>

                    {/* School code */}
                    <td>
                      <code style={{
                        background: 'var(--acc3)', color: 'var(--acc)',
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      }}>
                        {s.school_code}
                      </code>
                    </td>

                    {/* Is Active toggle */}
                    <td style={{ textAlign: 'center' }}>
                      <Toggle
                        checked={isActive}
                        onChange={v => setEdit(s.id, 'is_active', v)}
                        colorOn="#10b981"
                        label="Is Active"
                      />
                      {hasEdit && edits[s.id].is_active !== origActive && (
                        <div style={{ fontSize: 10, color: 'var(--m)', marginTop: 3 }}>
                          was: {origActive ? 'Active' : 'Inactive'}
                        </div>
                      )}
                    </td>

                    {/* Registration Open toggle */}
                    <td style={{ textAlign: 'center' }}>
                      <Toggle
                        checked={isRegOpen}
                        onChange={v => setEdit(s.id, 'is_registration_active', v)}
                        colorOn="#6366f1"
                        label="Registration Open"
                      />
                      {hasEdit && edits[s.id].is_registration_active !== origRegOpen && (
                        <div style={{ fontSize: 10, color: 'var(--m)', marginTop: 3 }}>
                          was: {origRegOpen ? 'Open' : 'Closed'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Sticky save footer (when there are pending changes) ────────── */}
      {pendingCount > 0 && (
        <div style={{
          position: 'sticky', bottom: 16, zIndex: 100,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', marginTop: 20,
          background: 'var(--card)', border: '1.5px solid var(--bd)',
          borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.12)',
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', alignSelf: 'center' }}>
            💾 {pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={discardChanges}
            style={{
              padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: '1.5px solid var(--bd)', background: 'transparent',
              color: 'var(--m)', cursor: 'pointer',
            }}
          >
            Discard
          </button>
          <button
            onClick={saveChanges}
            disabled={saving}
            style={{
              padding: '9px 24px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: 'none', background: 'var(--acc)', color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '⏳ Saving…' : `Save Changes (${pendingCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
