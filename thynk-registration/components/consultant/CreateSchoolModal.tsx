'use client';
import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/supabase/client';
import { Field, IS, fmtR } from './ui';

type Row = Record<string,any>;

export function CreateSchoolModal({ onClose, onCreated, BACKEND, programs }:
  { onClose:()=>void; onCreated:()=>void; BACKEND:string; programs:Row[] }) {
  const [saving, setSaving] = useState(false);
  const [error,    setError]    = useState('');
  const [f, setF] = useState({
    school_code:'', name:'', org_name:'', address:'', pin_code:'',
    country:'India', state:'', city:'', project_id:'',
    school_price:'', currency:'INR', discount_code:'',
    primary_color:'#4f46e5', accent_color:'#8b5cf6',
    is_active:true, is_registration_active:true,
  });
  const [contacts, setContacts] = useState([{ name:'', designation:'', email:'', mobile:'' }]);

  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => {
    const val = e.target.type==='checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setF(p => {
      const u:any = {...p,[k]:val};
      if (k==='school_code') u.discount_code=(val as string).toUpperCase();
      if (k==='country')     u.currency=(val as string)==='India'?'INR':'USD';
      return u;
    });
  };

  async function handleSave() {
    if (!f.school_code||!f.name||!f.org_name||!f.project_id||!f.school_price) {
      setError('School Code, Name, Org Name, Program and Price are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await authFetch(`${BACKEND}/api/admin/schools`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...f, school_price:Math.round(Number(f.school_price)*100), contact_persons:contacts}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error??'Failed to create school'); setSaving(false); return; }
      onCreated(); onClose();
    } catch(e:any) { setError(e.message); setSaving(false); }
  }

  const selProgram = programs.find(p => p.id===f.project_id);

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,
                  display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:20,
                    width:'100%',maxWidth:700,maxHeight:'92vh',overflowY:'auto',padding:'28px 28px 24px' }}>

        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 }}>
          <h2 style={{ margin:0,fontSize:18,fontWeight:800,color:'var(--text)',fontFamily:'Sora,sans-serif' }}>🏫 Create New School</h2>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--m)' }}>✕</button>
        </div>

        <div style={{ background:'rgba(79,70,229,.06)',border:'1px solid rgba(79,70,229,.2)',borderRadius:10,
                      padding:'10px 14px',fontSize:12,color:'#4f46e5',fontWeight:600,marginBottom:16 }}>
          🔒 This school will be automatically assigned to your consultant account.
        </div>

        {error && (
          <div style={{ background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',
                        borderRadius:10,padding:'10px 14px',fontSize:13,color:'#ef4444',marginBottom:16 }}>{error}</div>
        )}

        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px' }}>
          <Field label="School Code *">
            <input style={{...IS,fontFamily:'monospace'}} value={f.school_code} onChange={set('school_code')} placeholder="e.g. delhi-dps" />
          </Field>
          <Field label="School Name *">
            <input style={IS} value={f.name} onChange={set('name')} placeholder="Delhi Public School" />
          </Field>
          <Field label="Organisation Name *">
            <input style={IS} value={f.org_name} onChange={set('org_name')} placeholder="DPS Society" />
          </Field>
          <Field label="Country *">
            <select style={IS} value={f.country} onChange={set('country')}>
              {['India','United Arab Emirates','Saudi Arabia','Kuwait','Qatar','Bahrain','Singapore','Malaysia'].map(c=>
                <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="State *">
            <input style={IS} value={f.state} onChange={set('state')} placeholder="Gujarat" />
          </Field>
          <Field label="City *">
            <input style={IS} value={f.city} onChange={set('city')} placeholder="Ahmedabad" />
          </Field>
        </div>

        <Field label="Address">
          <textarea style={{...IS,height:64,resize:'vertical'}} value={f.address} onChange={set('address')} placeholder="Full street address…" />
        </Field>
        <Field label="Pin Code">
          <input style={IS} value={f.pin_code} onChange={set('pin_code')} placeholder="380001" />
        </Field>

        {/* Contacts */}
        <div style={{ border:'1.5px solid var(--bd)',borderRadius:12,padding:'14px 16px',marginBottom:14 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'var(--m)',textTransform:'uppercase',letterSpacing:'0.5px' }}>👤 Contact Persons</div>
            {contacts.length<4 && (
              <button onClick={()=>setContacts(c=>[...c,{name:'',designation:'',email:'',mobile:''}])}
                style={{ background:'rgba(79,70,229,.1)',color:'#4f46e5',border:'1px solid rgba(79,70,229,.3)',
                         borderRadius:8,padding:'4px 12px',fontSize:11,fontWeight:600,cursor:'pointer' }}>+ Add</button>
            )}
          </div>
          {contacts.map((c,idx)=>(
            <div key={idx} style={{ background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:10,
                                    padding:'12px 14px',marginBottom:idx<contacts.length-1?10:0 }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
                <span style={{ fontSize:11,fontWeight:700,color:'var(--m)' }}>Contact {idx+1}</span>
                {contacts.length>1 && (
                  <button onClick={()=>setContacts(p=>p.filter((_,i)=>i!==idx))}
                    style={{ background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:14 }}>✕</button>
                )}
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px' }}>
                {(['name','designation','email','mobile'] as const).map(k=>(
                  <Field key={k} label={k.charAt(0).toUpperCase()+k.slice(1)}>
                    <input style={IS} value={c[k]}
                      onChange={e=>setContacts(prev=>prev.map((x,i)=>i===idx?{...x,[k]:e.target.value}:x))}
                      placeholder={k==='email'?'school@example.com':k==='mobile'?'+91 98765 43210':''} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Program & Pricing */}
        <div style={{ border:'1.5px solid var(--bd)',borderRadius:12,padding:'14px 16px',marginBottom:14 }}>
          <div style={{ fontSize:11,fontWeight:700,color:'var(--m)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12 }}>💰 Program & Pricing</div>
          <Field label="Program *">
            <select style={IS} value={f.project_id} onChange={set('project_id')}>
              <option value="">Select a program</option>
              {programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {selProgram && (
            <div style={{ background:'rgba(79,70,229,.06)',borderRadius:8,padding:'8px 12px',marginBottom:12,
                          display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span style={{ fontSize:12,color:'var(--m)',fontWeight:600 }}>Program Base Price</span>
              <span style={{ fontSize:15,fontWeight:800,color:'#4f46e5',fontFamily:'Sora,sans-serif' }}>
                {f.country==='India'?`₹${fmtR(selProgram.base_amount_inr??selProgram.base_amount??0)}`:`$${fmtR(selProgram.base_amount_usd??0)}`}
              </span>
            </div>
          )}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px' }}>
            <Field label={`School Price (${f.currency}) *`}>
              <input style={IS} type="number" value={f.school_price} onChange={set('school_price')} placeholder="400" />
            </Field>
            <Field label="Currency">
              <select style={IS} value={f.currency} onChange={set('currency')}>
                <option value="INR">INR (₹)</option><option value="USD">USD ($)</option>
              </select>
            </Field>
          </div>
        </div>

        <Field label="Discount Code">
          <input style={{...IS,textTransform:'uppercase',fontFamily:'monospace',fontWeight:700}}
            value={f.discount_code}
            onChange={e=>setF(p=>({...p,discount_code:e.target.value.toUpperCase()}))}
            placeholder="DELHI-DPS" />
        </Field>

        <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:20 }}>
          <button onClick={onClose} style={{ padding:'10px 20px',borderRadius:10,border:'1.5px solid var(--bd)',
                                             background:'var(--card)',fontSize:14,fontWeight:700,cursor:'pointer',color:'var(--m)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding:'10px 24px',borderRadius:10,border:'none',
            background:saving?'rgba(79,70,229,.5)':'#4f46e5',color:'#fff',
            fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',
          }}>{saving?'⏳ Creating…':'✅ Create School'}</button>
        </div>
      </div>
    </div>
  );
}
