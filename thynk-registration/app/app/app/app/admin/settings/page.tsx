'use client';
import { authFetch } from '@/lib/supabase/client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
type Row = Record<string, any>;

// ── Styles ───────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width:'100%', padding:'10px 14px', border:'1.5px solid var(--bd)',
  borderRadius:9, fontSize:13, fontFamily:'DM Sans,sans-serif',
  color:'var(--text)', background:'var(--card)', outline:'none',
  boxSizing:'border-box' as const,
};
const lbl: React.CSSProperties = {
  display:'block', fontSize:11, fontWeight:700, letterSpacing:'1px',
  textTransform:'uppercase' as const, color:'var(--m)', marginBottom:6,
  fontFamily:'DM Sans,sans-serif',
};

const COUNTRY_EMOJI: Record<string,string> = {
  India:'🇮🇳', UAE:'🇦🇪', USA:'🇺🇸', UK:'🇬🇧', Canada:'🇨🇦',
  Australia:'🇦🇺', Singapore:'🇸🇬', Qatar:'🇶🇦', Kuwait:'🇰🇼',
  Bahrain:'🇧🇭', Oman:'🇴🇲', 'Saudi Arabia':'🇸🇦',
};

// ── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast,setToast] = useState('');
  const ref = useRef<any>();
  function show(msg:string) { setToast(msg); clearTimeout(ref.current); ref.current=setTimeout(()=>setToast(''),3000); }
  return {toast,show};
}

// ── Grade Modal ───────────────────────────────────────────────────────────────
function GradeModal({
  initial, onClose, onSave, saving,
}:{
  initial?:Row; onClose:()=>void; onSave:(d:Row)=>void; saving:boolean;
}) {
  const [f,setF] = useState({
    id:         initial?.id ?? '',
    name:       initial?.name ?? '',
    sort_order: initial?.sort_order ?? 0,
    is_active:  initial?.is_active !== false,
  });

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--card)',borderRadius:18,width:'100%',maxWidth:420,boxShadow:'0 24px 64px rgba(0,0,0,.2)',padding:28}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}}>
          <div>
            <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)'}}>{f.id ? 'Edit Grade' : 'Add Grade'}</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>Grades appear in the registration form dropdown</div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'var(--m)',fontSize:20}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={lbl}>Grade Name *</label>
            <input
              value={f.name}
              onChange={e=>setF(p=>({...p,name:e.target.value}))}
              placeholder="e.g. Grade 1"
              style={inp}
            />
            <div style={{fontSize:10,color:'var(--m)',marginTop:4}}>Use plain names: Nursery, Grade 1, Grade 2 … Grade 12</div>
          </div>
          <div>
            <label style={lbl}>Sort Order</label>
            <input
              type="number"
              value={f.sort_order}
              onChange={e=>setF(p=>({...p,sort_order:Number(e.target.value)}))}
              min={0}
              style={inp}
            />
            <div style={{fontSize:10,color:'var(--m)',marginTop:4}}>Lower number appears first in dropdown</div>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>Active</div>
            <div onClick={()=>setF(p=>({...p,is_active:!p.is_active}))}
              style={{width:44,height:24,borderRadius:12,background:f.is_active?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:f.is_active?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:22,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'9px 20px',borderRadius:9,border:'1.5px solid var(--bd)',background:'var(--card)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',color:'var(--m)'}}>Cancel</button>
          <button onClick={()=>onSave(f)} disabled={saving||!f.name.trim()}
            style={{padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:saving||!f.name.trim()?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:saving||!f.name.trim()?0.6:1}}>
            {saving?'Saving…':f.id?'Save Changes':'Add Grade'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grade Master Tab ──────────────────────────────────────────────────────────
function GradeMasterTab() {
  const {toast,show:showToast} = useToast();
  const [grades,    setGrades]    = useState<Row[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow,   setEditRow]   = useState<Row|undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await authFetch(`${BACKEND}/api/admin/grades`);
    const d = await r.json();
    setGrades(d.grades ?? []);
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); },[load]);

  async function toggleActive(row:Row) {
    await authFetch(`${BACKEND}/api/admin/grades`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:row.id, is_active:!row.is_active}),
    });
    load();
  }

  async function deleteGrade(row:Row) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    const res = await authFetch(`${BACKEND}/api/admin/grades`, {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:row.id}),
    });
    if (res.ok) { showToast('🗑 Grade deleted'); load(); }
    else showToast('❌ Could not delete — grade may be in use');
  }

  async function handleSave(d:Row) {
    setSaving(true);
    const res = await authFetch(`${BACKEND}/api/admin/grades`, {
      method: d.id ? 'PATCH' : 'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(d),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { showToast('❌ '+(json.error||'Failed')); return; }
    showToast(d.id ? '✅ Grade updated!' : '✅ Grade added!');
    setModalOpen(false); setEditRow(undefined); load();
  }

  const activeCount = grades.filter(g=>g.is_active).length;

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--m)',fontSize:14}}>Loading grades…</div>;

  return (
    <>
      {toast && (
        <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:18}}>
        {[
          {label:'Total Grades',  value:grades.length,  color:'var(--acc)'},
          {label:'Active',        value:activeCount,    color:'#4ADE80'},
          {label:'Inactive',      value:grades.length-activeCount, color:'var(--m)'},
        ].map(s=>(
          <div key={s.label} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontWeight:800,fontSize:22,color:s.color,fontFamily:'Sora,sans-serif'}}>{s.value}</span>
            <span style={{fontSize:11,color:'var(--m)',fontWeight:500}}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div style={{background:'rgba(79,70,229,.08)',border:'1.5px solid rgba(79,70,229,.2)',borderRadius:12,padding:'12px 16px',marginBottom:16,display:'flex',gap:10,alignItems:'flex-start'}}>
        <span style={{fontSize:18,flexShrink:0}}>ℹ️</span>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--text)',lineHeight:1.6}}>
          These grades are the <strong>global grade pool</strong>. When creating or editing a <strong>Program (Product Master)</strong>, you select which grades apply to that program — only those grades will appear in the student registration form.
        </div>
      </div>

      {/* Add button */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button
          onClick={()=>{setEditRow(undefined);setModalOpen(true);}}
          style={{display:'flex',alignItems:'center',gap:7,padding:'9px 20px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
          + Add Grade
        </button>
      </div>

      {/* Grade list */}
      <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
        {grades.length === 0 ? (
          <div style={{padding:40,textAlign:'center',color:'var(--m)',fontSize:13}}>
            No grades yet. Click "Add Grade" to create your first grade.
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{display:'grid',gridTemplateColumns:'60px 1fr 80px 100px 120px',gap:0,padding:'10px 18px',borderBottom:'1.5px solid var(--bd)',background:'var(--bg)'}}>
              {['Order','Grade Name','Status','Toggle','Actions'].map(h=>(
                <div key={h} style={{fontSize:10,fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',color:'var(--m)',fontFamily:'DM Sans,sans-serif'}}>{h}</div>
              ))}
            </div>
            {grades.map((row,idx)=>(
              <div
                key={row.id}
                style={{display:'grid',gridTemplateColumns:'60px 1fr 80px 100px 120px',gap:0,padding:'11px 18px',borderBottom:idx<grades.length-1?'1px solid var(--bd)':'none',alignItems:'center',opacity:row.is_active?1:.55,transition:'opacity .15s'}}
              >
                {/* Sort order */}
                <span style={{fontFamily:'monospace',fontSize:12,color:'var(--m)',fontWeight:600}}>#{row.sort_order}</span>

                {/* Name */}
                <div>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,color:'var(--text)'}}>{row.name}</div>
                </div>

                {/* Status badge */}
                <span style={{padding:'3px 10px',borderRadius:100,background:row.is_active?'rgba(16,185,129,.1)':'var(--bd)',color:row.is_active?'#15803d':'var(--m)',fontSize:10,fontWeight:700,whiteSpace:'nowrap'}}>
                  {row.is_active ? 'Active' : 'Inactive'}
                </span>

                {/* Toggle */}
                <div
                  onClick={()=>toggleActive(row)}
                  style={{width:44,height:24,borderRadius:12,background:row.is_active?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                  <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:row.is_active?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:6}}>
                  <button
                    onClick={()=>{setEditRow(row);setModalOpen(true);}}
                    style={{padding:'5px 12px',borderRadius:7,border:'1.5px solid var(--bd)',background:'var(--card)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button
                    onClick={()=>deleteGrade(row)}
                    style={{padding:'5px 10px',borderRadius:7,border:'1.5px solid var(--red2)',background:'var(--red2)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {modalOpen && (
        <GradeModal
          initial={editRow}
          onClose={()=>{setModalOpen(false);setEditRow(undefined);}}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </>
  );
}

// ── Location Form Modal ──────────────────────────────────────────────────────
function LocationModal({initial,onClose,onSave,saving}:{
  initial?:Row; onClose:()=>void; onSave:(d:Row)=>void; saving:boolean;
}) {
  const [f,setF] = useState({
    id:initial?.id??'', country:initial?.country??'India',
    state:initial?.state??'', city:initial?.city??'',
    sort_order:initial?.sort_order??0, is_active:initial?.is_active!==false,
  });

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--card)',borderRadius:18,width:'100%',maxWidth:480,boxShadow:'0 24px 64px rgba(0,0,0,.2)',padding:28}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}}>
          <div>
            <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)'}}>{f.id?'Edit Location':'Add Location'}</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>Countries, states and cities used in registration forms</div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'var(--m)',fontSize:20}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={lbl}>Country *</label>
            <input value={f.country} onChange={e=>setF(p=>({...p,country:e.target.value}))} placeholder="India" style={inp}/>
          </div>
          <div>
            <label style={lbl}>State / Region *</label>
            <input value={f.state} onChange={e=>setF(p=>({...p,state:e.target.value}))} placeholder="Delhi" style={inp}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
            <div>
              <label style={lbl}>City (optional)</label>
              <input value={f.city} onChange={e=>setF(p=>({...p,city:e.target.value}))} placeholder="New Delhi" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Sort Order</label>
              <input type="number" value={f.sort_order} onChange={e=>setF(p=>({...p,sort_order:Number(e.target.value)}))} min={0} style={inp}/>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>Active</div>
            <div onClick={()=>setF(p=>({...p,is_active:!p.is_active}))}
              style={{width:44,height:24,borderRadius:12,background:f.is_active?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:f.is_active?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:22,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'9px 20px',borderRadius:9,border:'1.5px solid var(--bd)',background:'var(--card)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',color:'var(--m)'}}>Cancel</button>
          <button onClick={()=>onSave(f)} disabled={saving||!f.state}
            style={{padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:saving||!f.state?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:saving||!f.state?.trim()?0.6:1}}>
            {saving?'Saving…':f.id?'Save Changes':'Add Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Location Master Tab ──────────────────────────────────────────────────────
function LocationMasterTab() {
  const {toast,show:showToast} = useToast();
  const [rows,          setRows]          = useState<Row[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [activeCountry, setActiveCountry] = useState('');
  const [activeState,   setActiveState]   = useState('');
  const [search,        setSearch]        = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editRow,       setEditRow]       = useState<Row|undefined>();

  const load = useCallback(async()=>{
    setLoading(true);
    const r = await authFetch(`${BACKEND}/api/admin/location?type=all&includeInactive=true`);
    const d = await r.json();
    setRows(d.locations??[]);
    setLoading(false);
  },[]);

  useEffect(()=>{ load(); },[load]);

  const countries = [...new Set(rows.map(r=>r.country))].sort((a,b)=>{
    if(a==='India') return -1; if(b==='India') return 1; return a.localeCompare(b);
  });
  const filteredCountries = countries.filter(c=>c.toLowerCase().includes(countrySearch.toLowerCase()));

  useEffect(()=>{ if(!activeCountry&&countries.length) setActiveCountry(countries[0]); },[countries.length]);
  const statesInCountry = [...new Set(rows.filter(r=>r.country===activeCountry).map(r=>r.state))].sort();
  useEffect(()=>{ setActiveState(''); },[activeCountry]);
  useEffect(()=>{ if(!activeState&&statesInCountry.length) setActiveState(statesInCountry[0]); },[statesInCountry.length,activeCountry]);

  const citiesInState = rows.filter(r=>
    r.country===activeCountry && r.state===activeState &&
    (search===''||r.city?.toLowerCase().includes(search.toLowerCase())||r.state?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.city??'').localeCompare(b.city??''));

  async function toggleActive(row:Row) {
    await authFetch(`${BACKEND}/api/admin/location`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,is_active:!row.is_active})});
    load();
  }
  async function deleteRow(row:Row) {
    if(!confirm(`Delete "${row.city||row.state}"?`)) return;
    await authFetch(`${BACKEND}/api/admin/location`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id})});
    showToast('🗑 Deleted'); load();
  }
  async function handleSave(d:Row) {
    setSaving(true);
    const res = await authFetch(`${BACKEND}/api/admin/location`,{method:d.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const json = await res.json();
    setSaving(false);
    if(!res.ok){ showToast('❌ '+(json.error||'Failed')); return; }
    showToast(d.id?'✅ Updated!':'✅ Added!');
    setModalOpen(false); setEditRow(undefined); load();
  }

  if(loading) return <div style={{padding:40,textAlign:'center',color:'var(--m)',fontSize:14}}>Loading location data…</div>;

  const activeCount  = rows.filter(r=>r.is_active).length;
  const stateCount   = [...new Set(rows.map(r=>r.country+'|'+r.state))].length;

  return (
    <>
      {toast && <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>{toast}</div>}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
        {[
          {label:'Total Entries',  value:rows.length,      color:'var(--acc)'},
          {label:'Active',         value:activeCount,      color:'#4ADE80'},
          {label:'Countries',      value:countries.length, color:'#f59e0b'},
          {label:'States/Regions', value:stateCount,       color:'var(--m)'},
        ].map(s=>(
          <div key={s.label} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontWeight:800,fontSize:22,color:s.color,fontFamily:'Sora,sans-serif'}}>{s.value}</span>
            <span style={{fontSize:11,color:'var(--m)',fontWeight:500}}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button onClick={()=>{setEditRow(undefined);setModalOpen(true);}}
          style={{display:'flex',alignItems:'center',gap:7,padding:'9px 20px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
          + Add Location
        </button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:12,height:'calc(100vh - 380px)',minHeight:400}}>
        <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:10,borderBottom:'1.5px solid var(--bd)'}}>
            <input placeholder="Search countries…" value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} style={{...inp,padding:'8px 12px',fontSize:12}}/>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:6}}>
            {filteredCountries.map(c=>{
              const cnt = rows.filter(r=>r.country===c).length;
              const isAct = c===activeCountry;
              return (
                <button key={c} onClick={()=>setActiveCountry(c)}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',marginBottom:2,background:isAct?'var(--acc3)':'transparent',borderLeft:`3px solid ${isAct?'var(--acc)':'transparent'}`,transition:'all .12s'}}>
                  <span style={{fontSize:18,flexShrink:0}}>{COUNTRY_EMOJI[c]??'🌍'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:isAct?700:500,color:isAct?'var(--acc)':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c}</div>
                    <div style={{fontSize:10,color:'var(--m)'}}>{cnt} entries</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1.5px solid var(--bd)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            <span style={{fontSize:28}}>{COUNTRY_EMOJI[activeCountry]??'🌍'}</span>
            <div style={{flex:1}}>
              <h2 style={{fontFamily:'Sora,sans-serif',fontSize:17,fontWeight:800,margin:0,color:'var(--text)'}}>{activeCountry||'Select a country'}</h2>
              <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{statesInCountry.length} states · {rows.filter(r=>r.country===activeCountry).length} entries</div>
            </div>
            <input placeholder="Search cities…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,padding:'7px 12px',fontSize:12,width:180}}/>
          </div>

          <div style={{display:'flex',gap:6,padding:'10px 14px',borderBottom:'1.5px solid var(--bd)',overflowX:'auto',flexShrink:0}}>
            {statesInCountry.map(s=>(
              <button key={s} onClick={()=>setActiveState(s)}
                style={{padding:'5px 14px',borderRadius:20,border:`1.5px solid ${s===activeState?'var(--acc)':'var(--bd)'}`,cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap',flexShrink:0,background:s===activeState?'var(--acc)':'transparent',color:s===activeState?'#fff':'var(--m)',transition:'all .12s'}}>
                {s}
                <span style={{marginLeft:5,fontSize:10,opacity:0.7}}>({rows.filter(r=>r.country===activeCountry&&r.state===s).length})</span>
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto'}}>
            {citiesInState.length===0 ? (
              <div style={{padding:32,textAlign:'center',color:'var(--m)',fontSize:13}}>
                {activeState ? 'No cities in this state. Add one!' : 'Select a state from the tabs above.'}
              </div>
            ) : citiesInState.map(row=>(
              <div key={row.id} style={{display:'flex',alignItems:'center',gap:14,padding:'10px 18px',borderBottom:'1px solid var(--bd)',opacity:row.is_active?1:.6,transition:'opacity .15s'}}>
                <span style={{fontFamily:'monospace',fontSize:10,color:'var(--m)',width:24,textAlign:'center',flexShrink:0}}>{row.sort_order}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontWeight:600,fontSize:13,color:'var(--text)'}}>{row.city||'—'}</div>
                  <div style={{fontSize:10,color:'var(--m)'}}>{row.state}, {row.country}</div>
                </div>
                <span style={{padding:'2px 8px',borderRadius:100,background:row.is_active?'rgba(16,185,129,.1)':'var(--bd)',color:row.is_active?'#15803d':'var(--m)',fontSize:10,fontWeight:700}}>
                  {row.is_active?'Active':'Inactive'}
                </span>
                <button onClick={()=>toggleActive(row)} title={row.is_active?'Deactivate':'Activate'}
                  style={{background:'none',border:'none',cursor:'pointer',color:row.is_active?'#10b981':'var(--m)',fontSize:18,padding:4}}>
                  {row.is_active?'◉':'○'}
                </button>
                <button onClick={()=>{setEditRow(row);setModalOpen(true);}}
                  style={{padding:'5px 10px',borderRadius:7,border:'1.5px solid var(--bd)',background:'var(--card)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                  Edit
                </button>
                <button onClick={()=>deleteRow(row)}
                  style={{padding:'5px 10px',borderRadius:7,border:'1.5px solid var(--red2)',background:'var(--red2)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && (
        <LocationModal
          initial={editRow}
          onClose={()=>{setModalOpen(false);setEditRow(undefined);}}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </>
  );
}

// ── Platform Settings Tab ────────────────────────────────────────────────────
function PlatformSettingsTab() {
  const {toast,show:showToast} = useToast();
  const [settings, setSettings] = useState({
    site_name:    'Thynk Registration',
    support_email:'',
    support_phone:'',
    default_currency:'INR',
    registration_open:true,
    success_redirect_url:'',
    logo_url:'',
  });
  const [loading,setSaving] = useState(false);

  useEffect(()=>{
    authFetch(`${BACKEND}/api/admin/settings`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d&&typeof d==='object') setSettings(p=>({...p,...d})); })
      .catch(()=>{});
  },[]);

  async function save() {
    setSaving(true);
    const res = await authFetch(`${BACKEND}/api/admin/settings`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(settings),
    });
    setSaving(false);
    if(res.ok) showToast('✅ Settings saved!');
    else showToast('❌ Save failed');
  }

  const set = (k:string,v:any)=>setSettings(p=>({...p,[k]:v}));

  return (
    <div style={{maxWidth:700}}>
      {toast && <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>{toast}</div>}

      <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:28,display:'flex',flexDirection:'column',gap:20}}>
        <div style={{marginBottom:4}}>
          <div style={{fontFamily:'Sora,sans-serif',fontSize:16,fontWeight:700,color:'var(--text)'}}>Platform Settings</div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--m)',marginTop:2}}>Global configuration for your Thynk Registration platform</div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div>
            <label style={lbl}>Platform Name</label>
            <input value={settings.site_name} onChange={e=>set('site_name',e.target.value)} placeholder="Thynk Registration" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Default Currency</label>
            <select value={settings.default_currency} onChange={e=>set('default_currency',e.target.value)} style={{...inp,cursor:'pointer'}}>
              <option value="INR">INR — Indian Rupee (₹)</option>
              <option value="USD">USD — US Dollar ($)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Support Email</label>
            <input type="email" value={settings.support_email} onChange={e=>set('support_email',e.target.value)} placeholder="support@thynk.com" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Support Phone</label>
            <input value={settings.support_phone} onChange={e=>set('support_phone',e.target.value)} placeholder="+91 99999 00000" style={inp}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={lbl}>Post-Payment Success Redirect URL</label>
            <input value={settings.success_redirect_url} onChange={e=>set('success_redirect_url',e.target.value)} placeholder="https://www.thynksuccess.com/thank-you" style={inp}/>
            <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Where to redirect students after a successful payment. Leave blank to use the default.</p>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={lbl}>Logo URL</label>
            <input value={settings.logo_url} onChange={e=>set('logo_url',e.target.value)} placeholder="https://cdn.example.com/logo.png" style={inp}/>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',background:'var(--bg)',borderRadius:12,border:'1.5px solid var(--bd)'}}>
          <div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:14,fontWeight:700,color:'var(--text)'}}>Registration Open</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--m)'}}>When off, new registrations are blocked across all schools and programs</div>
          </div>
          <div onClick={()=>set('registration_open',!settings.registration_open)}
            style={{width:52,height:28,borderRadius:14,background:settings.registration_open?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:settings.registration_open?27:3,transition:'left .2s',boxShadow:'0 2px 4px rgba(0,0,0,.2)'}}/>
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button onClick={save} disabled={loading}
            style={{display:'flex',alignItems:'center',gap:8,padding:'11px 28px',borderRadius:10,background:'var(--acc)',border:'none',color:'#fff',cursor:loading?'not-allowed':'pointer',fontSize:14,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:loading?0.7:1}}>
            {loading?'Saving…':'💾 Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab, setTab] = useState<'grades'|'locations'|'platform'>('grades');

  const TABS = [
    {k:'grades'    as const, icon:'🎓', label:'Grade Master'},
    {k:'locations' as const, icon:'📍', label:'Location Master'},
    {k:'platform'  as const, icon:'⚙️',  label:'Platform Settings'},
  ];

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>
      <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px'}}>
        {/* Header */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'Sora,sans-serif',fontSize:26,fontWeight:800,color:'var(--text)',margin:'0 0 4px'}}>
            Settings
          </h1>
          <p style={{fontSize:13,color:'var(--m)',margin:0}}>
            Grade master, location master data, platform configuration, and global settings
          </p>
        </div>

        {/* Tab bar */}
        <div style={{display:'flex',gap:8,marginBottom:24}}>
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,
                border:`1.5px solid ${tab===t.k?'var(--acc)':'var(--bd)'}`,
                background:tab===t.k?'var(--acc3)':'var(--card)',
                color:tab===t.k?'var(--acc)':'var(--text)',
                fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab==='grades'    && <GradeMasterTab/>}
        {tab==='locations' && <LocationMasterTab/>}
        {tab==='platform'  && <PlatformSettingsTab/>}

        <div style={{marginTop:24}}>
          <a href="/admin" style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'var(--acc)',textDecoration:'none',fontWeight:600}}>← Back to Admin Dashboard</a>
        </div>
      </div>
    </div>
  );
}
