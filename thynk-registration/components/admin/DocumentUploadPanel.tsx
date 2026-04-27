'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const CATEGORIES = ['general', 'contract', 'invoice', 'report', 'media', 'other'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string }> = {
  general:  { label: 'General',  color: '#6366f1', bg: '#eef2ff' },
  contract: { label: 'Contract', color: '#8b5cf6', bg: '#f5f3ff' },
  invoice:  { label: 'Invoice',  color: '#f59e0b', bg: '#fffbeb' },
  report:   { label: 'Report',   color: '#10b981', bg: '#ecfdf5' },
  media:    { label: 'Media',    color: '#ec4899', bg: '#fdf2f8' },
  other:    { label: 'Other',    color: '#64748b', bg: '#f8fafc' },
};

const FILE_ICON: Record<string, string> = {
  'application/pdf': '📕',
  'application/msword': '📘',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
  'application/vnd.ms-excel': '📗',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📗',
  'audio/mpeg': '🎵', 'audio/wav': '🎵', 'audio/ogg': '🎵',
  'video/mp4': '🎬', 'video/webm': '🎬', 'video/quicktime': '🎬',
  'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/gif': '🖼️', 'image/webp': '🖼️',
};

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface School { id: string; name: string; school_code: string; }
interface Document {
  id: string; school_id: string; file_name: string; file_type: string;
  file_size: number; category: Category; description: string | null;
  is_visible: boolean; created_at: string; signed_url: string | null;
  schools?: { name: string; school_code: string };
}

export function DocumentUploadPanel({ showToast }: { showToast: (m: string, i?: string) => void }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Upload form
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [schoolDropOpen, setSchoolDropOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const [description, setDescription] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Filters
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterCat, setFilterCat] = useState('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const schoolDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/schools?status=approved`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSchools(d?.schools ?? []))
      .catch(() => {});
  }, []);

  // Close school dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (schoolDropRef.current && !schoolDropRef.current.contains(e.target as Node)) {
        setSchoolDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadDocs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSchool !== 'all') params.set('schoolId', filterSchool);
    if (filterCat !== 'all') params.set('category', filterCat);
    authFetch(`${BACKEND}/api/admin/documents?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDocs(d?.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterSchool, filterCat]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const toggleSchool = (id: string) => {
    setSelectedSchools(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const filteredSchoolOptions = schools.filter(s =>
    !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.school_code.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleFiles = (files: FileList | File[]) => {
    setPendingFiles(prev => [...prev, ...Array.from(files)]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!selectedSchools.length) { showToast('Please select at least one school', '⚠️'); return; }
    if (!pendingFiles.length) { showToast('Please select at least one file', '⚠️'); return; }

    setUploading(true);
    let successCount = 0;
    const progress: Record<string, number> = {};

    for (const schoolId of selectedSchools) {
      for (const file of pendingFiles) {
        const key = `${schoolId}-${file.name}`;
        progress[key] = 0;
        setUploadProgress({ ...progress });

        const fd = new FormData();
        fd.append('file', file);
        fd.append('schoolId', schoolId);
        fd.append('category', category);
        if (description) fd.append('description', description);

        try {
          const res = await authFetch(`${BACKEND}/api/admin/documents`, { method: 'POST', body: fd });
          if (res.ok) { progress[key] = 100; successCount++; }
          else { const d = await res.json(); showToast(`Failed: ${d.error ?? 'Unknown error'}`, '❌'); }
        } catch { showToast(`Upload error for ${file.name}`, '❌'); }
        setUploadProgress({ ...progress });
      }
    }

    setUploading(false);
    if (successCount > 0) {
      showToast(`${successCount} file(s) uploaded successfully`, '✅');
      setPendingFiles([]);
      setDescription('');
      setUploadProgress({});
      loadDocs();
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    const res = await authFetch(`${BACKEND}/api/admin/documents?id=${doc.id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Deleted', '🗑️'); loadDocs(); }
    else showToast('Delete failed', '❌');
  };

  const toggleVisibility = async (doc: Document) => {
    const res = await authFetch(`${BACKEND}/api/admin/documents`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, is_visible: !doc.is_visible }),
    });
    if (res.ok) { showToast(doc.is_visible ? 'Hidden from portal' : 'Now visible', '👁️'); loadDocs(); }
  };

  const selectedSchoolNames = selectedSchools.map(id => schools.find(s => s.id === id)?.name ?? '').filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── Upload Card ─────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '20px 24px' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>📤 Upload Documents</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Upload files for one or multiple schools at once</p>
        </div>

        <div style={{ padding: 24 }}>
          {/* School multi-select */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Select Schools * {selectedSchools.length > 0 && <span style={{ color: '#6366f1', fontWeight: 800 }}>({selectedSchools.length} selected)</span>}
            </label>
            <div ref={schoolDropRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setSchoolDropOpen(v => !v)}
                style={{
                  border: `2px solid ${schoolDropOpen ? '#6366f1' : '#e2e8f0'}`,
                  borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                  background: '#f8fafc', minHeight: 44,
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                  boxShadow: schoolDropOpen ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {selectedSchools.length === 0 ? (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Click to select schools…</span>
                ) : (
                  <>
                    {selectedSchoolNames.slice(0, 3).map((name, i) => (
                      <span key={i} style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {name}
                      </span>
                    ))}
                    {selectedSchools.length > 3 && (
                      <span style={{ background: '#e2e8f0', color: '#475569', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        +{selectedSchools.length - 3} more
                      </span>
                    )}
                  </>
                )}
                <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 10 }}>▼</span>
              </div>

              {schoolDropOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
                  background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <input
                      placeholder="🔍 Search schools..."
                      value={schoolSearch}
                      onChange={e => setSchoolSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <button onClick={() => setSelectedSchools(schools.map(s => s.id))}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Select All
                    </button>
                    <button onClick={() => setSelectedSchools([])}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Clear
                    </button>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {filteredSchoolOptions.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No schools found</div>
                    ) : filteredSchoolOptions.map(s => {
                      const selected = selectedSchools.includes(s.id);
                      return (
                        <label key={s.id} onClick={() => toggleSchool(s.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          cursor: 'pointer', background: selected ? '#eef2ff' : 'transparent',
                          borderBottom: '1px solid #f8fafc', transition: 'background 0.1s',
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: `2px solid ${selected ? '#6366f1' : '#cbd5e1'}`,
                            background: selected ? '#6366f1' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: '#0f172a' }}>{s.name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.school_code}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(c => {
                  const m = CATEGORY_META[c];
                  const sel = category === c;
                  return (
                    <button key={c} onClick={() => setCategory(c)} style={{
                      padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${sel ? m.color : '#e2e8f0'}`,
                      background: sel ? m.bg : '#f8fafc', color: sel ? m.color : '#64748b',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Description (optional)</label>
              <input
                type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Q1 Invoice, Admission contract..."
                style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
              />
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#6366f1' : '#cbd5e1'}`,
              borderRadius: 16, padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? '#eef2ff' : '#f8fafc',
              transition: 'all 0.2s', marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 10 }}>☁️</div>
            <div style={{ fontSize: 14, color: '#475569', fontWeight: 600 }}>
              Drag & drop files here or <span style={{ color: '#6366f1', textDecoration: 'underline' }}>browse</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>PDF · Word · Excel · Audio · Video · Max 100 MB per file</div>
            <input ref={fileInputRef} type="file" multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.mp3,.wav,.ogg,.mp4,.webm,.mov,.jpg,.jpeg,.png,.gif,.webp"
              style={{ display: 'none' }}
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f1f5f9', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 20 }}>{FILE_ICON[f.type] ?? '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{fmtBytes(f.size)}</div>
                    {uploadProgress[`-${f.name}`] !== undefined && (
                      <div style={{ height: 3, background: '#e2e8f0', borderRadius: 3, marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${uploadProgress[`-${f.name}`]}%`, background: '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                  {!uploading && (
                    <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', fontWeight: 700 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button onClick={handleUpload} disabled={uploading || !pendingFiles.length || !selectedSchools.length}
            style={{
              padding: '11px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
              background: (uploading || !pendingFiles.length || !selectedSchools.length) ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: (uploading || !pendingFiles.length || !selectedSchools.length) ? '#94a3b8' : '#fff',
              boxShadow: (uploading || !pendingFiles.length || !selectedSchools.length) ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
            }}>
            {uploading ? '⏳ Uploading...' : `⬆️ Upload ${pendingFiles.length ? `${pendingFiles.length} file(s)` : ''} ${selectedSchools.length > 1 ? `to ${selectedSchools.length} schools` : ''}`}
          </button>
        </div>
      </div>

      {/* ── Document Library ─────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>📚 Document Library</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{docs.length} document{docs.length !== 1 ? 's' : ''} uploaded</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 12, fontWeight: 600, outline: 'none' }}>
              <option value="all">All Schools</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 12, fontWeight: 600, outline: 'none' }}>
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>Loading documents...
            </div>
          ) : docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 4 }}>No documents yet</div>
              <div style={{ fontSize: 13 }}>Upload files above to get started</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(doc => {
                const cm = CATEGORY_META[doc.category] ?? CATEGORY_META.other;
                return (
                  <div key={doc.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    borderRadius: 14, border: '1.5px solid #f1f5f9', background: doc.is_visible ? '#fff' : '#fafafa',
                    opacity: doc.is_visible ? 1 : 0.6, transition: 'all 0.15s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}>
                    <span style={{ fontSize: 28, flexShrink: 0 }}>{FILE_ICON[doc.file_type] ?? '📄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: cm.bg, color: cm.color, fontWeight: 700, flexShrink: 0 }}>{cm.label}</span>
                        {!doc.is_visible && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>Hidden</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                        {doc.schools?.name ?? ''} · {fmtBytes(doc.file_size)} · {fmtDate(doc.created_at)}
                        {doc.description && <span style={{ marginLeft: 6, color: '#94a3b8' }}>· {doc.description}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {doc.signed_url && (
                        <a href={doc.signed_url} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                          ⬇️ Download
                        </a>
                      )}
                      <button onClick={() => toggleVisibility(doc)} title={doc.is_visible ? 'Hide from portal' : 'Show on portal'}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${doc.is_visible ? '#e2e8f0' : '#fbbf24'}`, background: doc.is_visible ? '#f8fafc' : '#fffbeb', color: '#475569', cursor: 'pointer', fontSize: 13 }}>
                        {doc.is_visible ? '👁️' : '🚫'}
                      </button>
                      <button onClick={() => handleDelete(doc)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #fee2e2', background: '#fff1f2', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
