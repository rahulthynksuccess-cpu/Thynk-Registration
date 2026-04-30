'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const CATEGORY_LABELS: Record<string, string> = {
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

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  category: string;
  description: string | null;
  created_at: string;
  download_url: string | null;
}

export function ClientDocumentsTab() {
  const [docs,       setDocs]       = useState<Document[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCat,  setFilterCat]  = useState('all');
  const [search,     setSearch]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCat !== 'all') params.set('category', filterCat);

    // Forward preview token so admin preview mode can load documents without a session
    const previewToken = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('preview_token')
      : null;
    if (previewToken) params.set('preview_token', previewToken);

    const fetchFn = previewToken
      ? (url: string) => fetch(url)   // no auth header needed in preview mode
      : (url: string) => authFetch(url);

    fetchFn(`${BACKEND}/api/school/documents?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDocs(d?.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterCat]);

  useEffect(() => { load(); }, [load]);

  const filtered = docs.filter(d =>
    !search || d.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category for a nicer layout
  const grouped = filtered.reduce<Record<string, Document[]>>((acc, d) => {
    const cat = d.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>📁 Documents</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Documents shared by the Thynk team
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="🔍 Search files…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, width: 180 }}
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div>Loading documents…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No documents yet</div>
          <div style={{ fontSize: 13 }}>Documents shared by your administrator will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {filterCat !== 'all' ? (
            // Flat list when category filtered
            <DocumentList docs={filtered} />
          ) : (
            // Grouped by category
            Object.entries(grouped).map(([cat, catDocs]) => (
              <div key={cat}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  {CATEGORY_LABELS[cat] ?? cat} ({catDocs.length})
                </div>
                <DocumentList docs={catDocs} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DocumentList({ docs }: { docs: Document[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {docs.map(doc => (
        <DocumentCard key={doc.id} doc={doc} />
      ))}
    </div>
  );
}

function DocumentCard({ doc }: { doc: Document }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!doc.download_url) return;
    setDownloading(true);
    try {
      // Fetch as blob and trigger native download
      const res = await fetch(doc.download_url);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const icon = FILE_ICON[doc.file_type] ?? '📄';
  const isMedia = doc.file_type.startsWith('video/') || doc.file_type.startsWith('audio/');

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 32, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>{doc.file_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            {fmtBytes(doc.file_size)} · {fmtDate(doc.created_at)}
          </div>
        </div>
      </div>

      {doc.description && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {doc.description}
        </p>
      )}

      {/* Preview for images */}
      {doc.file_type.startsWith('image/') && doc.download_url && (
        <img
          src={doc.download_url} alt={doc.file_name}
          style={{ width: '100%', borderRadius: 8, maxHeight: 140, objectFit: 'cover' }}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {doc.download_url && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              flex: 1, padding: '7px 14px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: downloading ? 'wait' : 'pointer',
            }}
          >
            {downloading ? '⏳ Downloading…' : '⬇️ Download'}
          </button>
        )}
        {doc.download_url && isMedia && (
          <a href={doc.download_url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
            ▶️ Open
          </a>
        )}
        {doc.download_url && doc.file_type === 'application/pdf' && (
          <a href={doc.download_url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
            👁️ View
          </a>
        )}
      </div>
    </div>
  );
}
