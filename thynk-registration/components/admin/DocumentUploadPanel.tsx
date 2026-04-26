'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const CATEGORIES = ['general', 'contract', 'invoice', 'report', 'media', 'other'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  general:  '📄 General',
  contract: '📝 Contract',
  invoice:  '🧾 Invoice',
  report:   '📊 Report',
  media:    '🎬 Media',
  other:    '📁 Other',
};

const FILE_ICON: Record<string, string> = {
  'application/pdf':    '📕',
  'application/msword': '📘',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
  'application/vnd.ms-excel': '📗',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📗',
  'audio/mpeg': '🎵', 'audio/wav': '🎵', 'audio/ogg': '🎵',
  'video/mp4':  '🎬', 'video/webm': '🎬', 'video/quicktime': '🎬',
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
  const [schools,    setSchools]    = useState<School[]>([]);
  const [docs,       setDocs]       = useState<Document[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [filterSchool, setFilterSchool] = useState('all');
  const [filterCat,    setFilterCat]    = useState('all');
  const [dragOver,   setDragOver]   = useState(false);

  // Upload form state
  const [selectedSchool, setSelectedSchool] = useState('');
  const [category,       setCategory]       = useState<Category>('general');
  const [description,    setDescription]    = useState('');
  const [pendingFiles,   setPendingFiles]   = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load schools
  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/schools/list`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSchools(d?.schools ?? []))
      .catch(() => {});
  }, []);

  const loadDocs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSchool !== 'all') params.set('schoolId', filterSchool);
    if (filterCat    !== 'all') params.set('category', filterCat);
    authFetch(`${BACKEND}/api/admin/documents?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDocs(d?.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterSchool, filterCat]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    setPendingFiles(prev => [...prev, ...arr]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removePending = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!selectedSchool) { showToast('Please select a school', '⚠️'); return; }
    if (!pendingFiles.length) { showToast('Please select at least one file', '⚠️'); return; }

    setUploading(true);
    let successCount = 0;
    const progress: Record<string, number> = {};

    for (const file of pendingFiles) {
      const key = file.name;
      progress[key] = 0;
      setUploadProgress({ ...progress });

      const fd = new FormData();
      fd.append('file', file);
      fd.append('schoolId', selectedSchool);
      fd.append('category', category);
      if (description) fd.append('description', description);

      try {
        const res = await authFetch(`${BACKEND}/api/admin/documents`, { method: 'POST', body: fd });
        if (res.ok) {
          progress[key] = 100;
          successCount++;
        } else {
          const d = await res.json();
          showToast(`Failed: ${d.error ?? 'Unknown error'}`, '❌');
        }
      } catch {
        showToast(`Upload error for ${file.name}`, '❌');
      }
      setUploadProgress({ ...progress });
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
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    const res = await authFetch(`${BACKEND}/api/admin/documents?id=${doc.id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Document deleted', '🗑️'); loadDocs(); }
    else showToast('Delete failed', '❌');
  };

  const toggleVisibility = async (doc: Document) => {
    const res = await authFetch(`${BACKEND}/api/admin/documents`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, is_visible: !doc.is_visible }),
    });
    if (res.ok) { showToast(doc.is_visible ? 'Hidden from portal' : 'Now visible on portal', '👁️'); loadDocs(); }
    else showToast('Update failed', '❌');
  };

  const filteredDocs = docs; // already filtered server-side

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Upload Card ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          📤 Upload Documents for Client
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Select School / Client *
            </label>
            <select
              value={selectedSchool}
              onChange={e => setSelectedSchool(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }}
            >
              <option value="">-- Choose school --</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Q1 Invoice, Admission contract..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
            transition: 'all 0.2s', marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Drag & drop files here or <span style={{ color: 'var(--accent)', fontWeight: 600 }}>browse</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            PDF, Word, Excel, Audio, Video · Max 100 MB per file
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.mp3,.wav,.ogg,.mp4,.webm,.mov,.jpg,.jpeg,.png,.gif,.webp"
            style={{ display: 'none' }}
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {/* Pending files list */}
        {pendingFiles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {pendingFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{FILE_ICON[f.type] ?? '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtBytes(f.size)}</div>
                  {uploadProgress[f.name] !== undefined && (
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress[f.name]}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
                    </div>
                  )}
                </div>
                {!uploading && (
                  <button onClick={() => removePending(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !pendingFiles.length || !selectedSchool}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            background: (uploading || !pendingFiles.length || !selectedSchool) ? 'var(--border)' : 'var(--accent)',
            color: 'white', transition: 'all 0.2s',
          }}
        >
          {uploading ? '⏳ Uploading...' : `⬆️ Upload ${pendingFiles.length ? `(${pendingFiles.length})` : ''}`}
        </button>
      </div>

      {/* ── Document Library ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            📚 Document Library
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filterSchool}
              onChange={e => setFilterSchool(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}
            >
              <option value="all">All Schools</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading documents…</div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No documents uploaded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredDocs.map(doc => (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--bg-hover)',
                opacity: doc.is_visible ? 1 : 0.55,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 26 }}>{FILE_ICON[doc.file_type] ?? '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.file_name}
                    {!doc.is_visible && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: 4 }}>Hidden</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {doc.schools?.name ?? ''} · {CATEGORY_LABELS[doc.category] ?? doc.category} · {fmtBytes(doc.file_size)} · {fmtDate(doc.created_at)}
                    {doc.description && ` · ${doc.description}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {doc.signed_url && (
                    <a href={doc.signed_url} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 12, cursor: 'pointer' }}>
                      ⬇️ Download
                    </a>
                  )}
                  <button
                    onClick={() => toggleVisibility(doc)}
                    title={doc.is_visible ? 'Hide from portal' : 'Show on portal'}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
                    {doc.is_visible ? '👁️' : '🚫'}
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
