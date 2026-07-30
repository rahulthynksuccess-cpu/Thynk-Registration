'use client';
/**
 * components/admin/ConsultantLetterGeneratorPanel.tsx
 *
 * Same working process as the School Letter Generator (LetterGeneratorPanel.tsx):
 *   Templates  — upload PDF template per program, set placeholder tokens + colors
 *   Generate   — select program → select consultants → (optionally edit the exact
 *                name/code text that gets printed for each one) → generate in bulk
 *   History    — generation log
 *
 * Zero cost. Zero external APIs. Reuses mupdf + pdf-lib, same as schools.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

type Tab = 'templates' | 'generate' | 'history';

interface Program  { id: string; name: string; slug: string; }
interface Template {
  id: string; project_id: string; file_name: string; file_size: number;
  consultant_name_token: string; consultant_code_token: string;
  name_token_color: string; code_token_color: string;
  description: string | null; is_active: boolean; created_at: string;
  download_url: string | null;
  projects: { name: string };
}
interface Consultant { id: string; name: string; consultant_code: string; email?: string; }
interface LetterLog {
  id: string; consultant_id: string; project_id: string;
  status: 'pending'|'processing'|'done'|'error';
  triggered_by: string; generated_at: string|null; error_message: string|null; created_at: string;
  consultants?: { full_name: string; consultant_code: string }; projects?: { name: string };
}

const fmtBytes = (b: number) => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;
const fmtDate  = (s: string)  => new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

// ── Reusable UI pieces ────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    done:       { bg:'#ecfdf5', color:'#059669', label:'✅ Done' },
    processing: { bg:'#eff6ff', color:'#2563eb', label:'⏳ Processing' },
    pending:    { bg:'#f8fafc', color:'#64748b', label:'🕐 Pending' },
    error:      { bg:'#fff1f2', color:'#e11d48', label:'❌ Error' },
  };
  const s = map[status] ?? map.pending;
  return <span style={{ background:s.bg, color:s.color, fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:700 }}>{s.label}</span>;
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</label>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width:36, height:36, borderRadius:8, border:'1.5px solid #e2e8f0', cursor:'pointer', padding:2 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:12, fontFamily:'monospace', outline:'none' }} />
      </div>
      <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{hint}</div>
    </div>
  );
}

function ConsultantMultiSelect({ consultants, selected, onChange }: { consultants: Consultant[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = consultants.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.consultant_code.toLowerCase().includes(search.toLowerCase()));
  const toggle   = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const names    = selected.map(id => consultants.find(c => c.id === id)?.name ?? '').filter(Boolean);

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div onClick={() => setOpen(v => !v)} style={{
        border:`1.5px solid ${open ? '#6366f1' : '#e2e8f0'}`, borderRadius:12,
        padding:'10px 14px', cursor:'pointer', background:'#f8fafc', minHeight:46,
        display:'flex', alignItems:'center', flexWrap:'wrap', gap:6,
        boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
      }}>
        {selected.length === 0
          ? <span style={{ color:'#94a3b8', fontSize:13 }}>Click to select consultants…</span>
          : <>
              {names.slice(0, 3).map((n,i) => <span key={i} style={{ background:'#eef2ff', color:'#6366f1', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{n}</span>)}
              {selected.length > 3 && <span style={{ background:'#e2e8f0', color:'#475569', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>+{selected.length-3} more</span>}
            </>
        }
        <span style={{ marginLeft:'auto', color:'#94a3b8', fontSize:10 }}>▼</span>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:200, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', overflow:'hidden' }}>
          <div style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9' }}>
            <input autoFocus placeholder="🔍 Search…" value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:6, padding:'8px 12px', borderBottom:'1px solid #f1f5f9' }}>
            <button onClick={e => { e.stopPropagation(); onChange(consultants.map(c => c.id)); }}
              style={{ flex:1, padding:'5px 0', borderRadius:7, border:'1.5px solid #6366f1', background:'#eef2ff', color:'#6366f1', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              Select All ({consultants.length})
            </button>
            <button onClick={e => { e.stopPropagation(); onChange([]); }}
              style={{ flex:1, padding:'5px 0', borderRadius:7, border:'1.5px solid #e2e8f0', background:'#f8fafc', color:'#64748b', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              Clear
            </button>
          </div>
          <div style={{ maxHeight:240, overflowY:'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding:16, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No consultants found</div>
              : filtered.map(c => {
                  const sel = selected.includes(c.id);
                  return (
                    <label key={c.id} onClick={e => { e.stopPropagation(); toggle(c.id); }}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background: sel ? '#eef2ff' : 'transparent', borderBottom:'1px solid #f8fafc' }}>
                      <div style={{ width:18, height:18, borderRadius:5, flexShrink:0, border:`2px solid ${sel ? '#6366f1' : '#cbd5e1'}`, background: sel ? '#6366f1' : '#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {sel && <span style={{ color:'#fff', fontSize:10, fontWeight:900 }}>✓</span>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight: sel ? 700 : 500, color:'#0f172a' }}>{c.name}</div>
                        <div style={{ fontSize:10, color:'#94a3b8' }}>{c.consultant_code}</div>
                      </div>
                    </label>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ══ Main Component ════════════════════════════════════════════════════════════

export function ConsultantLetterGeneratorPanel({ showToast }: { showToast: (msg: string, icon?: string) => void }) {
  const [tab,         setTab]        = useState<Tab>('templates');
  const [programs,    setPrograms]   = useState<Program[]>([]);
  const [templates,   setTemplates]  = useState<Template[]>([]);
  const [consultants, setConsultants]= useState<Consultant[]>([]);
  const [logs,        setLogs]       = useState<LetterLog[]>([]);
  const [loading,     setLoading]    = useState(false);

  // Upload form state
  const [upProgram,    setUpProgram]    = useState('');
  const [upNameToken,  setUpNameToken]  = useState('Consultant Name');
  const [upCodeToken,  setUpCodeToken]  = useState('tscons000');
  const [upNameColor,  setUpNameColor]  = useState('#1e3063');
  const [upCodeColor,  setUpCodeColor]  = useState('#0540ad');
  const [upDesc,       setUpDesc]       = useState('');
  const [upFile,       setUpFile]       = useState<File|null>(null);
  const [upLoading,    setUpLoading]    = useState(false);
  const [upDrag,       setUpDrag]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generate state
  const [genProgram,    setGenProgram]    = useState('');
  const [genConsultants,setGenConsultants]= useState<string[]>([]);
  const [generating,    setGenerating]    = useState(false);
  const [genResults,    setGenResults]    = useState<any[]>([]);
  const [genProgress,   setGenProgress]   = useState(0);
  // Per-consultant editable content — "give option to change the content"
  // before generating (defaults to their profile name / consultant code).
  const [contentOverrides, setContentOverrides] = useState<Record<string, { name: string; code: string }>>({});

  // Load programs
  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/projects`).then(r => r.ok ? r.json() : null).then(d => {
      const active = (d?.projects ?? []).filter((p: any) => p.status === 'active');
      setPrograms(active);
    }).catch(() => {});
  }, []);

  const loadTemplates = useCallback(() => {
    authFetch(`${BACKEND}/api/admin/consultant-letter-templates`).then(r => r.ok ? r.json() : null).then(d => setTemplates(d?.templates ?? [])).catch(() => {});
  }, []);

  const loadConsultants = useCallback(() => {
    authFetch(`${BACKEND}/api/admin/consultants`).then(r => r.ok ? r.json() : null).then(d => {
      setConsultants((d?.consultants ?? []).map((c: any) => ({ id: c.id, name: c.name || c.email, consultant_code: c.consultant_code || '—', email: c.email })));
    }).catch(() => {});
  }, []);

  const loadLogs = useCallback(() => {
    setLoading(true);
    authFetch(`${BACKEND}/api/admin/consultant-letters`).then(r => r.ok ? r.json() : null).then(d => setLogs(d?.logs ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { if (tab === 'generate') loadConsultants(); }, [tab, loadConsultants]);
  useEffect(() => { if (tab === 'history')  loadLogs(); },  [tab, loadLogs]);

  // Seed the content-override table whenever the selected consultant list changes
  useEffect(() => {
    setContentOverrides(prev => {
      const next = { ...prev };
      genConsultants.forEach(id => {
        if (!next[id]) {
          const c = consultants.find(x => x.id === id);
          next[id] = { name: c?.name ?? '', code: c?.consultant_code ?? '' };
        }
      });
      Object.keys(next).forEach(id => { if (!genConsultants.includes(id)) delete next[id]; });
      return next;
    });
  }, [genConsultants, consultants]);

  // ── Upload handler ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!upFile)    { showToast('Select a PDF file', '⚠️'); return; }
    if (!upProgram) { showToast('Select a program', '⚠️'); return; }
    if (!upFile.name.endsWith('.pdf')) { showToast('Only PDF files accepted', '⚠️'); return; }

    setUpLoading(true);
    const fd = new FormData();
    fd.append('file', upFile);
    fd.append('projectId', upProgram);
    fd.append('consultantNameToken', upNameToken);
    fd.append('consultantCodeToken', upCodeToken);
    fd.append('nameTokenColor',  upNameColor);
    fd.append('codeTokenColor',  upCodeColor);
    if (upDesc) fd.append('description', upDesc);

    try {
      const res  = await authFetch(`${BACKEND}/api/admin/consultant-letter-templates`, { method:'POST', body:fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Upload failed', '❌'); return; }
      showToast('Template uploaded ✓', '✅');
      setUpFile(null); setUpDesc('');
      loadTemplates();
    } catch { showToast('Upload error', '❌'); }
    finally  { setUpLoading(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await authFetch(`${BACKEND}/api/admin/consultant-letter-templates?id=${id}`, { method:'DELETE' });
    if (res.ok) { showToast('Deleted', '🗑️'); loadTemplates(); }
    else showToast('Delete failed', '❌');
  };

  // ── Generate handler ────────────────────────────────────────────────────────
  const selectedTmpl = templates.find(t => t.project_id === genProgram);

  const handleGenerate = async () => {
    if (!genProgram)          { showToast('Select a program', '⚠️'); return; }
    if (!genConsultants.length){ showToast('Select at least one consultant', '⚠️'); return; }
    if (!selectedTmpl)        { showToast('No template for this program — upload one first', '⚠️'); return; }

    setGenerating(true); setGenResults([]); setGenProgress(0);
    const BATCH = 5;
    const all: any[] = [];

    for (let i = 0; i < genConsultants.length; i += BATCH) {
      const batch = genConsultants.slice(i, i + BATCH);
      const overrides = Object.fromEntries(batch.map(id => [id, contentOverrides[id] ?? {}]));
      try {
        const res  = await authFetch(`${BACKEND}/api/admin/generate-consultant-letter`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ projectId: genProgram, consultantIds: batch, triggeredBy: 'bulk', overrides }),
        });
        const data = await res.json();
        if (res.ok && data.results) all.push(...data.results);
        else all.push(...batch.map(id => ({ consultantId:id, status:'error', error: data.error ?? 'Failed' })));
      } catch (e: any) {
        all.push(...batch.map(id => ({ consultantId:id, status:'error', error: e.message })));
      }
      setGenProgress(Math.min(100, Math.round(((i + BATCH) / genConsultants.length) * 100)));
      setGenResults([...all]);
    }

    setGenerating(false);
    const ok = all.filter(r => r.status === 'done').length;
    showToast(`${ok}/${genConsultants.length} letters generated`, ok === genConsultants.length ? '✅' : '⚠️');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:'DM Sans, sans-serif' }}>
      {/* Header + Tabs */}
      <div style={{ background:'linear-gradient(135deg,#1e3a5f,#2d6a9f)', borderRadius:'20px 20px 0 0', padding:'22px 28px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
          <div style={{ fontSize:36 }}>📨</div>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'#fff', fontFamily:'Sora, sans-serif' }}>Consultant Letter Generator</h2>
            <p style={{ margin:'4px 0 0', fontSize:13, color:'rgba(255,255,255,0.7)' }}>
              Upload PDF template per program → generate personalised letters → auto-publish to consultant documents
            </p>
          </div>
          <div style={{ marginLeft:'auto', background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'6px 12px', fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:600 }}>
            🆓 Same engine as the School letter generator
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {([
            { id:'templates', label:'📄 Templates', count: templates.length },
            { id:'generate',  label:'⚡ Generate',  count: null },
            { id:'history',   label:'📋 History',   count: logs.length || null },
          ] as { id:Tab; label:string; count:number|null }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'8px 18px', borderRadius:10, border:'none', cursor:'pointer',
              fontWeight:700, fontSize:13, transition:'all 0.15s',
              background: tab===t.id ? '#fff' : 'rgba(255,255,255,0.15)',
              color:      tab===t.id ? '#1e3a5f' : 'rgba(255,255,255,0.85)',
            }}>
              {t.label}{t.count != null ? <span style={{ fontSize:10, opacity:.7, marginLeft:5 }}>{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background:'#fff', borderRadius:'0 0 20px 20px', border:'1px solid #e2e8f0', borderTop:'none', padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.05)' }}>

        {/* ══ TEMPLATES TAB ══════════════════════════════════════════════════ */}
        {tab === 'templates' && (
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            <div style={{ background:'#f8fafc', borderRadius:16, border:'1.5px solid #e2e8f0', padding:22 }}>
              <h3 style={{ margin:'0 0 4px', fontSize:15, fontWeight:800, color:'#0f172a' }}>Upload Letter Template</h3>
              <p style={{ margin:'0 0 18px', fontSize:12, color:'#64748b' }}>
                Upload your letter as a <strong>PDF</strong> with placeholder tokens (e.g. <code>Consultant Name</code>).
                Specify the exact token text and its color — the generator will find and replace it in every consultant's letter.
              </p>

              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>Program *</label>
                <select value={upProgram} onChange={e => setUpProgram(e.target.value)}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #e2e8f0', background:'#fff', fontSize:13, color:'#0f172a', outline:'none' }}>
                  <option value="">Select program…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>Consultant Name Placeholder *</label>
                  <input value={upNameToken} onChange={e => setUpNameToken(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }} />
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>Exact text in your PDF to replace with each consultant's name</div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>Consultant Code Placeholder *</label>
                  <input value={upCodeToken} onChange={e => setUpCodeToken(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }} />
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>Exact text in your PDF to replace with each consultant's code</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <ColorField label="Name Color" hint="Color of the placeholder text in your PDF (used for replacement text)" value={upNameColor} onChange={setUpNameColor} />
                <ColorField label="Code Color" hint="Color of the code placeholder text in your PDF" value={upCodeColor} onChange={setUpCodeColor} />
              </div>

              <div style={{ background:'#fffbeb', border:'1.5px solid #fde68a', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400e', marginBottom:16 }}>
                <strong>💡 Finding the color:</strong> Open your PDF in any viewer → right-click the placeholder text → inspect or use a color picker tool to get the exact hex value. The replacement text will use the same color.
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#475569', marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>Description (optional)</label>
                <input value={upDesc} onChange={e => setUpDesc(e.target.value)}
                  placeholder="e.g. Consultant Onboarding Letter"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:13, color:'#0f172a', outline:'none', boxSizing:'border-box' }} />
              </div>

              <div
                onDrop={e => { e.preventDefault(); setUpDrag(false); const f=e.dataTransfer.files[0]; if(f) setUpFile(f); }}
                onDragOver={e => { e.preventDefault(); setUpDrag(true); }}
                onDragLeave={() => setUpDrag(false)}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:`2px dashed ${upDrag ? '#6366f1' : upFile ? '#10b981' : '#cbd5e1'}`,
                  borderRadius:14, padding:24, textAlign:'center', cursor:'pointer',
                  background: upDrag ? '#eef2ff' : upFile ? '#f0fdf4' : '#f8fafc',
                  marginBottom:16,
                }}
              >
                <div style={{ fontSize:36, marginBottom:8 }}>{upFile ? '📄' : '📁'}</div>
                {upFile
                  ? <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#059669' }}>{upFile.name}</div>
                      <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>{fmtBytes(upFile.size)} · <span style={{ color:'#6366f1', cursor:'pointer' }} onClick={e => { e.stopPropagation(); setUpFile(null); }}>Remove</span></div>
                    </div>
                  : <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#475569' }}>Drag & drop PDF here or <span style={{ color:'#6366f1', textDecoration:'underline' }}>browse</span></div>
                      <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>PDF only · Max 50 MB</div>
                    </div>
                }
                <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e => e.target.files?.[0] && setUpFile(e.target.files[0])} />
              </div>

              <button onClick={handleUpload} disabled={upLoading || !upFile || !upProgram}
                style={{
                  padding:'11px 28px', borderRadius:12, border:'none', cursor:'pointer', fontWeight:700, fontSize:14,
                  background: upLoading||!upFile||!upProgram ? '#e2e8f0' : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
                  color:      upLoading||!upFile||!upProgram ? '#94a3b8' : '#fff',
                  boxShadow:  upLoading||!upFile||!upProgram ? 'none' : '0 4px 14px rgba(30,58,95,0.35)',
                }}>
                {upLoading ? '⏳ Uploading…' : '⬆️ Upload Template'}
              </button>
            </div>

            <div>
              <h3 style={{ margin:'0 0 14px', fontSize:15, fontWeight:800, color:'#0f172a' }}>Uploaded Templates ({templates.length})</h3>
              {templates.length === 0
                ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
                    <div style={{ fontWeight:600 }}>No templates yet</div>
                    <div style={{ fontSize:13, marginTop:4 }}>Upload a PDF template for each program above</div>
                  </div>
                : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {templates.map(t => (
                      <div key={t.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:14, border:'1.5px solid #e2e8f0', background:'#fff' }}>
                        <span style={{ fontSize:32, flexShrink:0 }}>📄</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{t.file_name}</span>
                            <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'#eff6ff', color:'#2563eb', fontWeight:700 }}>{t.projects?.name}</span>
                          </div>
                          <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>
                            {fmtBytes(t.file_size)} · {fmtDate(t.created_at)}{t.description ? ` · ${t.description}` : ''}
                          </div>
                          <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, fontFamily:'monospace', display:'flex', alignItems:'center', gap:10 }}>
                            <span>Name: <strong>{t.consultant_name_token}</strong></span>
                            <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:t.name_token_color, border:'1px solid #e2e8f0', verticalAlign:'middle' }} />
                            <span>Code: <strong>{t.consultant_code_token}</strong></span>
                            <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:t.code_token_color, border:'1px solid #e2e8f0', verticalAlign:'middle' }} />
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                          {t.download_url && (
                            <a href={t.download_url} target="_blank" rel="noopener noreferrer"
                              style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#f8fafc', color:'#475569', textDecoration:'none', fontSize:13, fontWeight:600 }}>
                              ⬇️ Preview
                            </a>
                          )}
                          <button onClick={() => handleDelete(t.id, t.file_name)}
                            style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #fee2e2', background:'#fff1f2', color:'#ef4444', cursor:'pointer', fontSize:13 }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ══ GENERATE TAB ═══════════════════════════════════════════════════ */}
        {tab === 'generate' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Step 1 — Select Program</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {programs.map(p => {
                  const hasTmpl = templates.some(t => t.project_id === p.id);
                  const sel     = genProgram === p.id;
                  return (
                    <button key={p.id} onClick={() => { setGenProgram(p.id); setGenConsultants([]); setGenResults([]); }}
                      style={{
                        padding:'10px 18px', borderRadius:12, cursor:'pointer',
                        border:`2px solid ${sel ? '#1e3a5f' : '#e2e8f0'}`,
                        background: sel ? '#1e3a5f' : '#f8fafc',
                        color: sel ? '#fff' : '#0f172a',
                        fontWeight:700, fontSize:14, opacity: hasTmpl ? 1 : 0.5,
                      }}>
                      {p.name}
                      <span style={{ fontSize:10, marginLeft:6, opacity:.8 }}>{hasTmpl ? '✅' : '⚠️ no template'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {genProgram && (
              selectedTmpl
                ? <div style={{ background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:12, padding:'12px 16px', fontSize:13, color:'#15803d', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>📄</span>
                    <div>
                      <strong>Template ready:</strong> {selectedTmpl.file_name} · {fmtBytes(selectedTmpl.file_size)}
                      <div style={{ fontSize:11, marginTop:2, opacity:.8 }}>Tokens: <code>{selectedTmpl.consultant_name_token}</code> + <code>{selectedTmpl.consultant_code_token}</code></div>
                    </div>
                  </div>
                : <div style={{ background:'#fef9c3', border:'1.5px solid #fde047', borderRadius:12, padding:'12px 16px', fontSize:13, color:'#854d0e' }}>
                    ⚠️ No PDF template for this program — go to the <strong>Templates</strong> tab to upload one.
                  </div>
            )}

            {genProgram && selectedTmpl && (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>
                  Step 2 — Select Consultants {genConsultants.length > 0 && <span style={{ color:'#6366f1', marginLeft:8 }}>({genConsultants.length} selected)</span>}
                </div>
                <ConsultantMultiSelect consultants={consultants} selected={genConsultants} onChange={setGenConsultants} />
              </div>
            )}

            {/* Step 3 — edit the exact content per consultant before generating */}
            {genProgram && selectedTmpl && genConsultants.length > 0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>
                  Step 3 — Review / Edit Content (optional)
                </div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                  Defaults come from each consultant's profile. Edit a field below to override just the printed text for that letter.
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:280, overflowY:'auto' }}>
                  {genConsultants.map(id => {
                    const c = consultants.find(x => x.id === id);
                    const ov = contentOverrides[id] ?? { name: c?.name ?? '', code: c?.consultant_code ?? '' };
                    return (
                      <div key={id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, alignItems:'center', padding:'8px 12px', border:'1.5px solid #f1f5f9', borderRadius:10 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c?.name}</div>
                        <input value={ov.name} onChange={e => setContentOverrides(prev => ({ ...prev, [id]: { ...ov, name: e.target.value } }))}
                          placeholder="Printed name"
                          style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:12, outline:'none' }} />
                        <input value={ov.code} onChange={e => setContentOverrides(prev => ({ ...prev, [id]: { ...ov, code: e.target.value } }))}
                          placeholder="Printed code"
                          style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:12, fontFamily:'monospace', outline:'none' }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {genProgram && selectedTmpl && (
              <div>
                <button onClick={handleGenerate} disabled={generating || !genConsultants.length}
                  style={{
                    padding:'13px 32px', borderRadius:14, border:'none', cursor:'pointer',
                    fontWeight:800, fontSize:15,
                    background: generating||!genConsultants.length ? '#e2e8f0' : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
                    color:      generating||!genConsultants.length ? '#94a3b8' : '#fff',
                    boxShadow:  generating||!genConsultants.length ? 'none' : '0 4px 20px rgba(30,58,95,0.4)',
                  }}>
                  {generating ? `⏳ Generating… ${genProgress}%` : `⚡ Generate ${genConsultants.length ? `${genConsultants.length} Letter${genConsultants.length>1?'s':''}` : 'Letters'}`}
                </button>
                {!generating && genConsultants.length > 0 && (
                  <div style={{ fontSize:12, color:'#64748b', marginTop:8 }}>PDFs will appear in each consultant's Documents tab instantly</div>
                )}
              </div>
            )}

            {generating && (
              <div>
                <div style={{ height:8, background:'#e2e8f0', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${genProgress}%`, background:'linear-gradient(90deg,#1e3a5f,#2d6a9f)', borderRadius:4, transition:'width 0.4s' }} />
                </div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:6, textAlign:'center' }}>{genProgress}% complete · {genResults.filter(r=>r.status==='done').length}/{genConsultants.length} done</div>
              </div>
            )}

            {genResults.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {genResults.map((r, i) => (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderRadius:10, border:'1.5px solid #f1f5f9',
                    background: r.status==='done' ? '#f0fdf4' : r.status==='error' ? '#fff1f2' : '#f8fafc',
                  }}>
                    <span style={{ fontSize:18 }}>{r.status==='done' ? '✅' : '❌'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{r.consultantName ?? r.consultantId}</div>
                      {r.error && <div style={{ fontSize:11, color:'#e11d48', marginTop:2 }}>{r.error}</div>}
                    </div>
                    <Badge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ════════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:'#0f172a' }}>Generation History</h3>
              <button onClick={loadLogs} style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#f8fafc', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer' }}>🔄 Refresh</button>
            </div>
            {loading
              ? <div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}><div style={{ fontSize:32, marginBottom:8 }}>⏳</div>Loading…</div>
              : logs.length === 0
              ? <div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}><div style={{ fontSize:40, marginBottom:10 }}>📋</div><div style={{ fontWeight:600 }}>No letters generated yet</div></div>
              : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {logs.map(log => (
                    <div key={log.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderRadius:12, border:'1.5px solid #f1f5f9', background:'#fff' }}>
                      <span style={{ fontSize:24 }}>📄</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{log.consultants?.full_name ?? log.consultant_id}</div>
                        <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                          {log.projects?.name} · {log.triggered_by === 'bulk' ? '📦 Bulk' : '👤 Manual'} · {fmtDate(log.created_at)}
                        </div>
                        {log.error_message && <div style={{ fontSize:11, color:'#e11d48', marginTop:2 }}>{log.error_message}</div>}
                      </div>
                      <Badge status={log.status} />
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

      </div>
    </div>
  );
}
