'use client';
import React, { useState, useEffect, useRef } from 'react';
import AdminApprovalQueue from '@/components/admin/AdminApprovalQueue';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const fmtR = (p: number) => { const v = p / 100; return isNaN(v) ? '0' : v.toLocaleString('en-IN'); };
const SS: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none' };

// ── Dashboard Link Button ─────────────────────────────────────────────────────
// Calls /api/admin/preview-token to get a short-lived signed token,
// then opens /school/dashboard?preview_token=<token> in a new tab.
// Admin stays logged in to their own session — no school login required.
function DashboardLinkButton({ schoolId, label = '📊 Dashboard', style }: {
  schoolId: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function open() {
    setLoading(true); setError('');
    try {
      const res  = await authFetch(`${BACKEND}/api/admin/preview-token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ school_id: schoolId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to generate link'); setLoading(false); return; }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:2 }}>
      <button
        onClick={e => { e.stopPropagation(); open(); }}
        disabled={loading}
        style={{
          display:'inline-flex', alignItems:'center', gap:4,
          padding:'5px 12px', borderRadius:7,
          background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color:'#fff', fontSize:11, fontWeight:700,
          border:'none', cursor: loading ? 'not-allowed' : 'pointer',
          whiteSpace:'nowrap', textDecoration:'none',
          ...style,
        }}
      >
        {loading ? '⏳ Opening…' : label}
      </button>
      {error && <span style={{ fontSize:10, color:'#ef4444' }}>{error}</span>}
    </div>
  );
}

// ── Checkbox Dropdown ────────────────────────────────────────────────────────
function CheckDropdown({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const has = selected.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${has ? 'var(--acc)' : 'var(--bd)'}`, background: has ? 'var(--acc3)' : 'var(--card)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: has ? 'var(--acc)' : 'var(--m)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif' }}>
        {label}{has && <span style={{ background: 'var(--acc)', color: '#fff', borderRadius: 20, fontSize: 10, padding: '1px 6px', fontWeight: 800 }}>{selected.length}</span>}
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: 'var(--card)', border: '1.5px solid var(--bd)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: 6 }}>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} style={{ width: '100%', padding: '6px 10px', border: 'none', background: 'rgba(239,68,68,0.08)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4, textAlign: 'left' }}>
              Clear all
            </button>
          )}
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: selected.includes(opt) ? 700 : 500, color: 'var(--text)', background: selected.includes(opt) ? 'var(--acc3)' : 'transparent' }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: 'var(--acc)', width: 14, height: 14, flexShrink: 0 }} />
              {opt}
            </label>
          ))}
          {options.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--m)' }}>No options</div>}
        </div>
      )}
    </div>
  );
}

// ── School Analytics ─────────────────────────────────────────────────────────
// ── School Analytics — CRM Dashboard ────────────────────────────────────────
function SchoolAnalytics({ schools, programs }: { schools: Row[]; programs: Row[] }) {
  const progList = [...new Set(schools.map(s => {
    const p = programs.find(p => p.id===s.project_id||p.slug===s.project_slug);
    return p?.name ?? s.project_slug ?? '';
  }).filter(Boolean))].sort();
  const [selProgram, setSelProgram] = React.useState<string>('__all__');

  const base = selProgram==='__all__' ? schools : schools.filter(s => {
    const p = programs.find(p => p.id===s.project_id||p.slug===s.project_slug);
    return (p?.name??s.project_slug??'')=== selProgram;
  });

  const approved  = base.filter(s => !s.status||s.status==='approved');
  const pending   = base.filter(s => s.status&&s.status!=='approved');
  const regOpen   = approved.filter(s => s.is_registration_active);
  const regClosed = approved.filter(s => !s.is_registration_active);
  const COLORS = ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16'];

  const mkBreakdown = (key: (s: Row) => string) => {
    const m: Record<string,{total:number;open:number}> = {};
    base.forEach(s => {
      const k = key(s)||'Unknown';
      if(!m[k]) m[k]={total:0,open:0};
      m[k].total++;
      if(s.is_registration_active) m[k].open++;
    });
    return Object.keys(m).sort((a,b)=>m[b].total-m[a].total).slice(0,8)
      .map(k => ({ label:k, total:m[k].total, open:m[k].open, pct: Math.round(m[k].open/m[k].total*100) }));
  };

  const byProgram  = mkBreakdown(s => { const p=programs.find(p=>p.id===s.project_id||p.slug===s.project_slug); return p?.name??s.project_slug??'Unknown'; });
  const byCountry  = mkBreakdown(s => s.country);
  const byState    = mkBreakdown(s => s.state);
  const byCity     = mkBreakdown(s => s.city);

  function BarRow({ label, total, open, pct, color }: {label:string;total:number;open:number;pct:number;color:string}) {
    const maxT = base.length||1;
    return (
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--bd)' }}>
        <span style={{ fontSize:12, color:'var(--text)', minWidth:120, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }} title={label}>{label}</span>
        <div style={{ flex:1, height:10, background:'var(--bg)', borderRadius:5, overflow:'hidden', position:'relative' }}>
          <div style={{ position:'absolute', left:0, top:0, width:`${Math.round(total/maxT*100)}%`, height:'100%', background:`${color}25`, borderRadius:5 }} />
          <div style={{ position:'absolute', left:0, top:0, width:`${Math.round(open/maxT*100)}%`, height:'100%', background:color, borderRadius:5 }} />
        </div>
        <span style={{ fontSize:11, color:'var(--m)', minWidth:24, textAlign:'right' }}>{total}</span>
        <span style={{ fontSize:11, color:'#10b981', fontWeight:800, minWidth:24, textAlign:'right' }}>{open}</span>
        <span style={{ fontSize:10, fontWeight:700, minWidth:36, textAlign:'right', background:pct>=60?'#d1fae5':pct>=30?'#fef3c7':'#fee2e2', color:pct>=60?'#10b981':pct>=30?'#f59e0b':'#ef4444', padding:'1px 5px', borderRadius:4 }}>{pct}%</span>
      </div>
    );
  }

  function ChartCard({ title, children }: {title:string;children:React.ReactNode}) {
    return (
      <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{title}</div>
        <div style={{ fontSize:10, color:'var(--m2)', marginBottom:14, display:'flex', gap:14 }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#4f46e520', border:'1px solid #4f46e5', display:'inline-block' }}/> Total Schools</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#10b981', display:'inline-block' }}/> Reg Open</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#fef3c7', border:'1px solid #f59e0b', display:'inline-block' }}/> Open%</span>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {progList.length>1 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--m)' }}>Filter by Program:</span>
          {['__all__',...progList].map(p => (
            <button key={p} onClick={()=>setSelProgram(p)}
              style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all .15s', fontFamily:'DM Sans,sans-serif',
                background:selProgram===p?'var(--acc)':'transparent',
                borderColor:selProgram===p?'var(--acc)':'var(--bd)',
                color:selProgram===p?'#fff':'var(--m)',
              }}>
              {p==='__all__'?'🌐 All Programs':p}
              <span style={{ marginLeft:5, opacity:.7, fontSize:10 }}>({p==='__all__'?schools.length:base.length})</span>
            </button>
          ))}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
        {[
          { label:'Total Schools',    val:base.length,    sub:'in selection',       color:'#4f46e5', bg:'#eef2ff', icon:'🏫' },
          { label:'Approved',         val:approved.length,sub:'fully onboarded',    color:'#10b981', bg:'#ecfdf5', icon:'✅' },
          { label:'Pending Approval', val:pending.length, sub:'awaiting review',    color:'#f59e0b', bg:'#fffbeb', icon:'⏳' },
          { label:'Reg Open',         val:regOpen.length, sub:'accepting students', color:'#06b6d4', bg:'#ecfeff', icon:'🔓' },
          { label:'Reg Closed',       val:regClosed.length,sub:'not accepting',    color:'#94a3b8', bg:'#f8fafc', icon:'🔒' },
          { label:'Countries',        val:[...new Set(base.map(s=>s.country).filter(Boolean))].length, sub:'unique countries', color:'#8b5cf6', bg:'#f5f3ff', icon:'🌍' },
        ].map(m => (
          <div key={m.label} style={{ background:m.bg, border:`1.5px solid ${m.color}30`, borderRadius:14, padding:'16px 14px 12px' }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{m.icon}</div>
            <div style={{ fontSize:26, fontWeight:900, color:m.color, fontFamily:'Sora,sans-serif', lineHeight:1 }}>{m.val}</div>
            <div style={{ fontSize:12, fontWeight:700, color:m.color, marginTop:5, opacity:.9 }}>{m.label}</div>
            <div style={{ fontSize:10, color:'var(--m)', marginTop:2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Approval + Reg status side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>📋 Approval Status</div>
          {[
            { label:'Approved',    val:approved.length, color:'#10b981' },
            { label:'Pending',     val:pending.length,  color:'#f59e0b' },
          ].map(({label,val,color}) => {
            const pct = base.length>0?Math.round(val/base.length*100):0;
            return (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background:color, flexShrink:0 }} />
                <span style={{ fontSize:12, flex:1, fontWeight:500 }}>{label}</span>
                <div style={{ width:90, height:8, background:'var(--bg)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4 }} />
                </div>
                <span style={{ fontSize:13, fontWeight:800, color, minWidth:28, textAlign:'right' }}>{val}</span>
                <span style={{ fontSize:10, color:'var(--m)', minWidth:32, textAlign:'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
        <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>🔓 Registration Status</div>
          {[
            { label:'Registration Open',   val:regOpen.length,  color:'#10b981' },
            { label:'Registration Closed',  val:regClosed.length, color:'#94a3b8' },
          ].map(({label,val,color}) => {
            const pct = approved.length>0?Math.round(val/approved.length*100):0;
            return (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background:color, flexShrink:0 }} />
                <span style={{ fontSize:12, flex:1, fontWeight:500 }}>{label}</span>
                <div style={{ width:90, height:8, background:'var(--bg)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4 }} />
                </div>
                <span style={{ fontSize:13, fontWeight:800, color, minWidth:28, textAlign:'right' }}>{val}</span>
                <span style={{ fontSize:10, color:'var(--m)', minWidth:32, textAlign:'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Geographic + program breakdowns */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {selProgram==='__all__' && progList.length>1 && (
          <ChartCard title="📚 By Program">
            {byProgram.map((d,i)=><BarRow key={d.label} {...d} color={COLORS[i%COLORS.length]} />)}
          </ChartCard>
        )}
        <ChartCard title="🌍 By Country">
          {byCountry.map((d,i)=><BarRow key={d.label} {...d} color={COLORS[i%COLORS.length]} />)}
          {byCountry.length===0&&<div style={{color:'var(--m)',fontSize:12,padding:'8px 0'}}>No data</div>}
        </ChartCard>
        <ChartCard title="📍 By State (Top 8)">
          {byState.map((d,i)=><BarRow key={d.label} {...d} color={COLORS[i%COLORS.length]} />)}
          {byState.length===0&&<div style={{color:'var(--m)',fontSize:12,padding:'8px 0'}}>No data</div>}
        </ChartCard>
        <ChartCard title="🗺️ By City (Top 8)">
          {byCity.map((d,i)=><BarRow key={d.label} {...d} color={COLORS[i%COLORS.length]} />)}
          {byCity.length===0&&<div style={{color:'var(--m)',fontSize:12,padding:'8px 0'}}>No data</div>}
        </ChartCard>
      </div>

      {/* Active Schools — schools with student activity */}
      {(() => {
        const activeSchools = base
          .filter(s => s.status === 'approved' || !s.status)
          .map(s => {
            const prog = programs.find((p: Row) => p.id === s.project_id || p.slug === s.project_slug);
            return { ...s, prog } as Row & { prog: Row | undefined };
          })
          .filter(s => s.is_registration_active)
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

        const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

        return (
          <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>🟢 Schools with Active Registration</div>
                <div style={{ fontSize:11, color:'var(--m)', marginTop:3 }}>Click a school to open its dashboard directly</div>
              </div>
              <span style={{ background:'#d1fae5', color:'#065f46', borderRadius:20, fontSize:11, fontWeight:700, padding:'3px 10px' }}>
                {activeSchools.length} active
              </span>
            </div>
            {activeSchools.length === 0 && (
              <div style={{ textAlign:'center', padding:'24px', color:'var(--m)', fontSize:13 }}>No schools with active registration</div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10 }}>
              {activeSchools.map(s => {
                const regUrl  = s.branding?.redirectURL
                  ?? (s.project_slug && s.school_code ? `https://www.thynksuccess.com/registration/${s.project_slug}/${s.school_code}` : '');
                return (
                  <div key={s.id} style={{ background:'var(--bg)', border:'1.5px solid var(--bd)', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <div style={{ width:36, height:36, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🏫</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.name}>{s.name}</div>
                        <div style={{ fontSize:11, color:'var(--m)', marginTop:2 }}>{[s.city, s.country].filter(Boolean).join(', ')}</div>
                        <div style={{ fontSize:10, color:'var(--m2)', marginTop:1 }}>{s.prog?.name ?? s.project_slug ?? '—'}</div>
                      </div>
                      <code style={{ fontSize:10, background:'var(--acc3)', color:'var(--acc)', padding:'2px 7px', borderRadius:5, flexShrink:0 }}>{s.school_code}</code>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <DashboardLinkButton schoolId={s.id} label="📊 View Dashboard"
                        style={{ flex:1, justifyContent:'center', padding:'7px 0', borderRadius:8, fontSize:11 }} />
                      {regUrl && (
                        <a href={regUrl} target="_blank" rel="noreferrer"
                          style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px 0', borderRadius:8, background:'rgba(16,185,129,0.1)', color:'#10b981', border:'1.5px solid rgba(16,185,129,0.3)', fontSize:11, fontWeight:700, textDecoration:'none' }}>
                          🔗 Reg Page
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── School Detail Modal ──────────────────────────────────────────────────────
function SchoolDetailModal({ school, onClose, showToast }: {
  school: Row; onClose: () => void; showToast: (t: string, i?: string) => void;
}) {
  const [templates,   setTemplates]   = useState<Row[]>([]);
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email' | null>(null);
  const [selectedTpl, setSelectedTpl] = useState('');
  const primaryContact = Array.isArray(school.contact_persons) && school.contact_persons.length > 0
    ? school.contact_persons[0] : null;
  const [toPhone, setToPhone] = useState(primaryContact?.mobile ?? '');
  const [toEmail, setToEmail] = useState(primaryContact?.email  ?? '');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    authFetch(`${BACKEND}/api/admin/templates`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTemplates((d?.templates ?? []).filter((t: Row) => t.is_active)))
      .catch(() => {});
  }, []);

  const channelTemplates = templates.filter(t => t.channel === sendChannel);

  useEffect(() => {
    if (!selectedTpl) { setPreview(''); return; }
    const tpl = templates.find(t => t.id === selectedTpl);
    if (!tpl) return;
    const vars: Record<string,string> = {
      school_name:  school.name         ?? '',
      school_code:  school.school_code  ?? '',
      contact_name: primaryContact?.name ?? school.name ?? '',
      city:         school.city         ?? '',
      country:      school.country      ?? '',
      program_name: school.program_name ?? '',
    };
    setPreview(tpl.body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? `{{${k}}}`));
  }, [selectedTpl, templates, school]);

  async function handleSend() {
    if (!sendChannel || !selectedTpl) return;
    setSending(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel:     sendChannel,
          template_id: selectedTpl,
          school_id:   school.id,
          to_phone:    toPhone,
          to_email:    toEmail,
          vars: {
            school_name:  school.name         ?? '',
            school_code:  school.school_code  ?? '',
            contact_name: primaryContact?.name ?? '',
            city:         school.city         ?? '',
            country:      school.country      ?? '',
            program_name: school.program_name ?? '',
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'} sent!`, '✅');
        setSendChannel(null); setSelectedTpl(''); setPreview('');
      } else {
        showToast(`Send failed: ${data.error}`, '❌');
      }
    } catch (e: any) {
      showToast(e.message, '❌');
    }
    setSending(false);
  }

  const inp: React.CSSProperties = { width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'9px 12px', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', color:'var(--text)', background:'var(--card)', boxSizing:'border-box' };
  const lbl: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'var(--m)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--card)', borderRadius:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px', borderBottom:'1.5px solid var(--bd)' }}>
          <h3 style={{ margin:0, fontFamily:'Sora,sans-serif', fontSize:18, fontWeight:800, color:'var(--text)' }}>{school.name}</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', color:'var(--m)', fontSize:22, lineHeight:1 }}>&#x2715;</button>
        </div>
        <div style={{ padding:'0 24px' }}>
          {[
            ['Code',         school.school_code ?? '—'],
            ['Program',      school.program_name ?? '—'],
            ['Country',      school.country ?? '—'],
            ['City',         school.city ?? '—'],
            ['Status',       school.status ?? 'approved'],
            ['Registration', school.is_registration_active ? 'Open' : 'Closed'],
          ].map(([l,v]) => (
            <div key={String(l)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--bd)' }}>
              <div style={{ fontSize:13, color:'var(--m)' }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{String(v)}</div>
            </div>
          ))}
        </div>

        {sendChannel && (
          <div style={{ margin:'16px 24px', padding:16, background:'var(--bg)', borderRadius:12, border:'1.5px solid var(--bd)', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700, color:'var(--text)' }}>
              {sendChannel === 'whatsapp' ? '💬 Send WhatsApp' : '✉️ Send Email'}
            </div>
            <div>
              <label style={lbl}>{sendChannel === 'whatsapp' ? 'Phone' : 'Email'}</label>
              {sendChannel === 'whatsapp'
                ? <input style={inp} value={toPhone} onChange={e => setToPhone(e.target.value)} placeholder="91XXXXXXXXXX" />
                : <input style={inp} value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="contact@school.com" />
              }
            </div>
            <div>
              <label style={lbl}>Template *</label>
              <select style={{ ...inp, cursor:'pointer' }} value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}>
                <option value="">— Choose template —</option>
                {channelTemplates.length === 0
                  ? <option disabled>No active {sendChannel} templates</option>
                  : channelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                }
              </select>
            </div>
            {preview && (
              <div style={{ background:'rgba(79,70,229,.07)', borderRadius:9, padding:'10px 14px', border:'1px solid rgba(79,70,229,.2)' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--m)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Preview</div>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{preview}</div>
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setSendChannel(null); setSelectedTpl(''); setPreview(''); }}
                style={{ flex:1, padding:'9px 0', borderRadius:9, border:'1.5px solid var(--bd)', background:'var(--card)', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer', color:'var(--m)' }}>
                Cancel
              </button>
              <button onClick={handleSend}
                disabled={sending || !selectedTpl || (sendChannel === 'whatsapp' ? !toPhone : !toEmail)}
                style={{ flex:2, padding:'9px 0', borderRadius:9, background:sendChannel === 'whatsapp' ? '#1ab8a8' : 'var(--acc)', border:'none', color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:sending?'not-allowed':'pointer', opacity:(sending||!selectedTpl)?0.6:1 }}>
                {sending ? '⏳ Sending…' : `Send ${sendChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
              </button>
            </div>
          </div>
        )}

        {!sendChannel && (
          <div style={{ display:'flex', gap:10, padding:'16px 24px 20px' }}>
            <button onClick={() => { setSendChannel('whatsapp'); setToPhone(primaryContact?.mobile ?? ''); }}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'11px 0', borderRadius:12, border:'1.5px solid rgba(26,184,168,.35)', background:'rgba(26,184,168,.08)', color:'#0e8a7d', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              💬 WhatsApp
            </button>
            <button onClick={() => { setSendChannel('email'); setToEmail(primaryContact?.email ?? ''); }}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'11px 0', borderRadius:12, border:'1.5px solid rgba(245,158,11,.3)', background:'rgba(245,158,11,.07)', color:'#b45309', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ✉️ Email
            </button>
            {primaryContact?.mobile && (
              <a href={`tel:${primaryContact.mobile}`}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'11px 0', borderRadius:12, border:'1.5px solid rgba(239,68,68,.25)', background:'rgba(239,68,68,.06)', color:'#dc2626', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, textDecoration:'none' }}>
                📞 Call
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schools Page With Approval ───────────────────────────────────────────────
export function SchoolsPageWithApproval({
  schools, programs, isSuperAdmin, BACKEND, authHeaders, onEdit, onRefresh, showToast,
}: {
  schools: Row[]; programs: Row[]; isSuperAdmin: boolean; BACKEND: string;
  authHeaders: () => HeadersInit; onEdit: (s: Row) => void;
  onRefresh: () => void; showToast: (t: string, i?: string) => void;
}) {
  const [tab, setTab] = useState<'analytics' | 'queue' | 'approved'>('approved');
  const [schoolModal, setSchoolModal] = useState<Row | null>(null);

  const pendingSchools  = schools.filter(s => s.status && s.status !== 'approved');
  const approvedSchools = schools.filter(s => s.status === 'approved' || !s.status);

  const TAB = (active: boolean, color = 'var(--acc)'): React.CSSProperties => ({
    padding:'8px 18px', borderRadius:10, border:'1.5px solid', cursor:'pointer',
    fontSize:13, fontWeight:600, transition:'all .12s',
    background:  active ? color        : 'transparent',
    borderColor: active ? color        : 'var(--bd)',
    color:       active ? '#fff'       : 'var(--m)',
  });

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Schools <span>Management</span></h1>
          <p>
            {pendingSchools.length > 0 && (
              <span style={{ color:'#f59e0b', fontWeight:700, marginRight:12 }}>
                ⚠️ {pendingSchools.length} pending
              </span>
            )}
            {approvedSchools.length} approved · {schools.length} total
          </p>
        </div>
        <div className="topbar-right">
          <div style={{ display:'flex', gap:6 }}>
            <button style={TAB(tab === 'analytics', '#8b5cf6')} onClick={() => setTab('analytics')}>📊 Analytics</button>
            <button style={TAB(tab === 'queue')} onClick={() => setTab('queue')}>
              {pendingSchools.length > 0 && (
                <span style={{ background:'#ef4444', color:'#fff', borderRadius:20, fontSize:10, fontWeight:800, padding:'1px 6px', marginRight:6, display:'inline-block' }}>
                  {pendingSchools.length}
                </span>
              )}
              Approval Queue
            </button>
            <button style={TAB(tab === 'approved')} onClick={() => setTab('approved')}>School List</button>
          </div>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => onEdit({})}>+ Add School</button>
          )}
        </div>
      </div>

      {tab === 'analytics' && <SchoolAnalytics schools={schools} programs={programs} />}
      {tab === 'queue' && (
        <AdminApprovalQueue
          pendingSchools={pendingSchools} programs={programs}
          BACKEND={BACKEND} authHeaders={authHeaders}
          onRefresh={onRefresh} showToast={showToast}
        />
      )}
      {tab === 'approved' && (
        <SchoolsTableWithStatus
          schools={approvedSchools} programs={programs}
          isSuperAdmin={isSuperAdmin} onEdit={onEdit}
          onRowClick={s => {
            const prog = programs.find((p: Row) => p.id === s.project_id) ?? programs.find((p: Row) => p.slug === s.project_slug);
            setSchoolModal({ ...s, program_name: prog?.name ?? s.project_slug ?? '' });
          }}
        />
      )}

      {schoolModal && (
        <SchoolDetailModal school={schoolModal} onClose={() => setSchoolModal(null)} showToast={showToast} />
      )}
    </>
  );
}

// ── Schools Table With Status ────────────────────────────────────────────────
export function SchoolsTableWithStatus({
  schools, programs, isSuperAdmin, onEdit, onRowClick,
}: {
  schools: Row[]; programs: Row[]; isSuperAdmin: boolean;
  onEdit: (s: Row) => void; onRowClick?: (s: Row) => void;
}) {
  const [filterPrograms,  setFilterPrograms]  = useState<string[]>([]);
  const [filterCountries, setFilterCountries] = useState<string[]>([]);
  const [filterStates,    setFilterStates]    = useState<string[]>([]);
  const [filterCities,    setFilterCities]    = useState<string[]>([]);
  const [filterRegState,  setFilterRegState]  = useState<string[]>([]);

  const allPrograms = [...new Set(schools.map(s => {
    const p = programs.find(p => p.id === s.project_id || p.slug === s.project_slug);
    return p?.name ?? s.project_slug ?? '';
  }).filter(Boolean))].sort();
  const allCountries = [...new Set(schools.map(s => s.country).filter(Boolean))].sort();
  const allStates = [...new Set(
    schools.filter(s => !filterCountries.length || filterCountries.includes(s.country))
      .map(s => s.state).filter(Boolean)
  )].sort();
  const allCities = [...new Set(
    schools.filter(s =>
      (!filterCountries.length || filterCountries.includes(s.country)) &&
      (!filterStates.length    || filterStates.includes(s.state))
    ).map(s => s.city).filter(Boolean)
  )].sort();

  const filtered = schools.filter(s => {
    const prog = programs.find(p => p.id === s.project_id || p.slug === s.project_slug);
    const pn = prog?.name ?? s.project_slug ?? '';
    const regLabel = s.is_registration_active ? 'Open' : 'Closed';
    return (
      (!filterPrograms.length  || filterPrograms.includes(pn)) &&
      (!filterCountries.length || filterCountries.includes(s.country)) &&
      (!filterStates.length    || filterStates.includes(s.state)) &&
      (!filterCities.length    || filterCities.includes(s.city)) &&
      (!filterRegState.length  || filterRegState.includes(regLabel))
    );
  });

  // Summary strip counts
  const regOpenCount = filtered.filter(s => s.is_registration_active).length;
  const byCountry: Record<string,number> = {};
  filtered.forEach(s => { const c = s.country ?? 'Unknown'; byCountry[c] = (byCountry[c] ?? 0) + 1; });
  const topCountries = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0,3);
  const activeFilterCount = [filterPrograms, filterCountries, filterStates, filterCities, filterRegState].filter(a => a.length > 0).length;

  return (
    <>
      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:16 }}>
        {[
          { label:'Showing',   val:filtered.length,                  color:'#4f46e5', icon:'🏫' },
          { label:'Reg Open',  val:regOpenCount,                     color:'#10b981', icon:'🔓' },
          { label:'Reg Closed',val:filtered.length - regOpenCount,   color:'#94a3b8', icon:'🔒' },
          { label:'Countries', val:Object.keys(byCountry).length,    color:'#8b5cf6', icon:'🌍' },
          ...topCountries.map(([c,n]) => ({ label:c, val:n, color:'#f59e0b', icon:'📍' })),
        ].map(m => (
          <div key={m.label} style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>{m.icon}</span>
            <div>
              <div style={{ fontWeight:800, fontSize:18, color:m.color, fontFamily:'Sora,sans-serif', lineHeight:1 }}>{m.val}</div>
              <div style={{ fontSize:10, color:'var(--m)' }}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Checkbox filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <CheckDropdown label="Program"      options={allPrograms}  selected={filterPrograms}  onChange={setFilterPrograms} />
        <CheckDropdown label="Country"      options={allCountries} selected={filterCountries} onChange={v => { setFilterCountries(v); setFilterStates([]); setFilterCities([]); }} />
        <CheckDropdown label="State"        options={allStates}    selected={filterStates}    onChange={v => { setFilterStates(v); setFilterCities([]); }} />
        <CheckDropdown label="City"         options={allCities}    selected={filterCities}    onChange={setFilterCities} />
        <CheckDropdown label="Registration" options={['Open','Closed']} selected={filterRegState} onChange={setFilterRegState} />
        {activeFilterCount > 0 && (
          <button onClick={() => { setFilterPrograms([]); setFilterCountries([]); setFilterStates([]); setFilterCities([]); setFilterRegState([]); }}
            style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #ef4444', background:'rgba(239,68,68,0.07)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#ef4444', fontFamily:'DM Sans,sans-serif' }}>
            Clear all ({activeFilterCount})
          </button>
        )}
        <span style={{ fontSize:12, color:'var(--m)', marginLeft:'auto' }}>{filtered.length} of {schools.length}</span>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th><th>School Name</th><th>Location</th><th>Program</th>
              <th>Price</th><th>Discount Code</th><th>Registration URL</th>
              <th>Reg Active</th><th>Status</th><th>Dashboard</th>
              {isSuperAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={11} className="table-empty">No schools match the selected filters.</td></tr>
              : filtered.map(s => {
                  const prog = programs.find(p => p.id === s.project_id) ?? programs.find(p => p.slug === s.project_slug);
                  // Use stored branding.redirectURL (most accurate) or fallback
                  const regUrl = s.branding?.redirectURL
                    ?? `${prog?.base_url || 'https://www.thynksuccess.com'}/registration/${s.project_slug ?? ''}/${s.school_code}`;

                  const schoolCurr  = s.pricing?.[0]?.currency ?? 'INR';
                  const priceFmt    = schoolCurr === 'USD' ? `$${fmtR(s.pricing?.[0]?.base_amount ?? 0)}` : `₹${fmtR(s.pricing?.[0]?.base_amount ?? 0)}`;
                  const status      = s.status || 'approved';
                  const statusClass = status === 'approved' ? 'badge-paid' : status === 'pending_approval' ? 'badge-initiated' : 'badge-pending';
                  const statusLabel = status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Pending' : 'Registered';
                  return (
                    <tr key={s.id} onClick={() => onRowClick?.(s)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                      <td><code style={{ background:'var(--acc3)', color:'var(--acc)', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 }}>{s.school_code}</code></td>
                      <td style={{ fontWeight:700 }}>
                        {s.name}
                        {s.org_name && s.org_name !== s.name && <div style={{ fontSize:11, color:'var(--m)', fontWeight:400 }}>{s.org_name}</div>}
                      </td>
                      <td style={{ fontSize:12 }}>{[s.city, s.state, s.country].filter(Boolean).join(', ') || '—'}</td>
                      <td style={{ fontSize:12 }}>{prog?.name ?? s.project_slug ?? '—'}</td>
                      <td><span className="amt">{priceFmt}</span></td>
                      <td><code style={{ background:'var(--orange2)', color:'var(--orange)', padding:'2px 8px', borderRadius:6, fontSize:11 }}>{s.discount_code || s.school_code?.toUpperCase()}</code></td>
                      <td>
                        <a href={regUrl} target="_blank" rel="noreferrer" style={{ color:'var(--acc)', fontSize:11, textDecoration:'none' }} onClick={e => e.stopPropagation()}>
                          🔗 {regUrl.replace('https://','').slice(0,36)}
                        </a>
                      </td>
                      <td><span className={`badge ${s.is_registration_active ? 'badge-paid' : 'badge-cancelled'}`}>{s.is_registration_active ? 'Open' : 'Closed'}</span></td>
                      <td><span className={`badge ${statusClass}`}>{statusLabel}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <DashboardLinkButton schoolId={s.id} />
                      </td>
                      {isSuperAdmin && (
                        <td>
                          <button className="btn btn-outline" style={{ fontSize:11, padding:'4px 10px' }} onClick={e => { e.stopPropagation(); onEdit(s); }}>Edit</button>
                        </td>
                      )}
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </>
  );
}
