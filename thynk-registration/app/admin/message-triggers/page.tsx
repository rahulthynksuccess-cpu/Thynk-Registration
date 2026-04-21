'use client';
import { authFetch } from '@/lib/supabase/client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

// ── Types ────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;
type Channel  = 'email' | 'whatsapp';
const CHANNEL_COLOR: Record<Channel, string> = { email:'#60A5FA', whatsapp:'#25D366' };

interface Template { id:string; name:string; channel:Channel; subject?:string; body:string; is_active:boolean; }
interface Trigger  {
  id:string; event_type:string; channel:Channel; school_id:string|null;
  template_id:string|null; is_active:boolean; created_at:string;
  recipient_type: 'student' | 'school';
  notification_templates?: {id:string; name:string; channel:string};
}

const EVENT_TYPES = [
  {key:'registration.created', label:'Registration Created',  desc:'Fires when a student submits the registration form'},
  {key:'payment.paid',         label:'Payment Successful',   desc:'Fires when payment is confirmed'},
  {key:'payment.failed',       label:'Payment Failed',       desc:'Fires when payment fails or is cancelled'},
  {key:'school.registered',    label:'School Registered',    desc:'Fires when a new school submits registration (free flow)'},
  {key:'school.approved',      label:'School Approved',      desc:'Fires when admin approves a school'},
];

// Events where recipient_type makes no sense (always goes to school contact)
const SCHOOL_ONLY_EVENTS = new Set(['school.registered', 'school.approved']);

const TEMPLATE_VARS = [
  '{{student_name}}','{{class_grade}}','{{gender}}','{{parent_name}}',
  '{{contact_phone}}','{{contact_email}}','{{school_name}}','{{program_name}}',
  '{{base_amount}}','{{discount_amount}}','{{final_amount}}',
  '{{discount_code}}','{{gateway}}','{{txn_id}}','{{registration_id}}',
  '{{payment_link}}',
  '{{contact_person_name}}','{{contact_designation}}','{{org_name}}','{{city}}',
];

const inp: React.CSSProperties = {
  width:'100%', padding:'10px 12px', background:'var(--card)',
  border:'1.5px solid var(--bd)', borderRadius:8,
  color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif',
  outline:'none', boxSizing:'border-box' as const,
};
const lbl: React.CSSProperties = {
  display:'block', fontSize:11, fontWeight:700, letterSpacing:'0.1em',
  textTransform:'uppercase' as const, color:'var(--m)', marginBottom:6,
  fontFamily:'DM Sans,sans-serif',
};

// ── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast,setToast] = useState('');
  const ref = useRef<any>();
  function show(msg:string) {
    setToast(msg); clearTimeout(ref.current);
    ref.current = setTimeout(()=>setToast(''),3000);
  }
  return {toast,show};
}

// ── Template Form Modal ──────────────────────────────────────────────────────
function TemplateModal({initial,onClose,onSave}:{initial?:Template;onClose:()=>void;onSave:(d:Partial<Template>)=>void}) {
  const [f,setF] = useState<Partial<Template>>(initial??{channel:'email',is_active:true,name:'',subject:'',body:''});
  const set = (k:keyof Template,v:any)=>setF(p=>({...p,[k]:v}));
  const [preview,setPreview] = useState(false);

  function insertVar(v:string) { setF(p=>({...p,body:(p.body||'')+v})); }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--card)',borderRadius:18,width:'100%',maxWidth:640,maxHeight:'92vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1.5px solid var(--bd)',position:'sticky',top:0,background:'var(--card)',zIndex:1}}>
          <div>
            <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)'}}>{initial?.id?'Edit Template':'New Template'}</div>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>Email & WhatsApp message templates</div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'var(--m)',fontSize:20}}>✕</button>
        </div>
        <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14}}>
            <div>
              <label style={lbl}>Template Name *</label>
              <input value={f.name??''} onChange={e=>set('name',e.target.value)} placeholder="e.g. Payment Confirmation" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Channel *</label>
              <div style={{display:'flex',gap:8}}>
                {(['email','whatsapp'] as Channel[]).map(c=>(
                  <button key={c} onClick={()=>set('channel',c)}
                    style={{flex:1,padding:'10px 0',borderRadius:8,border:`1.5px solid ${f.channel===c?CHANNEL_COLOR[c]:'var(--bd)'}`,background:f.channel===c?CHANNEL_COLOR[c]+'20':'var(--card)',color:f.channel===c?CHANNEL_COLOR[c]:'var(--m)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {c==='email'?'📧':'💬'} {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {f.channel==='email' && (
            <div>
              <label style={lbl}>Subject</label>
              <input value={f.subject??''} onChange={e=>set('subject',e.target.value)} placeholder="Registration Confirmed — {{student_name}}" style={inp}/>
            </div>
          )}

          <div>
            <label style={lbl}>Insert Variable (click to add)</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {TEMPLATE_VARS.map(v=>(
                <button key={v} onClick={()=>insertVar(v)}
                  style={{padding:'3px 8px',borderRadius:4,background:'var(--acc3)',border:'1.5px solid rgba(79,70,229,.2)',color:'var(--acc)',fontSize:11,fontFamily:'monospace',cursor:'pointer'}}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <label style={{...lbl,margin:0}}>{f.channel==='whatsapp'?'Message':'Body'}</label>
              {f.channel==='email' && (
                <button onClick={()=>setPreview(!preview)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--acc)',fontSize:12,fontWeight:600}}>
                  {preview?'✏️ Edit':'👁️ Preview'}
                </button>
              )}
            </div>

            {preview && f.channel==='email' ? (
              <div style={{background:'var(--bg)',borderRadius:10,padding:20}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--m)',marginBottom:4}}>Subject</div>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:14,paddingBottom:12,borderBottom:'1.5px solid var(--bd)'}}>{f.subject||'(no subject)'}</div>
                <div style={{fontSize:13,color:'var(--text)',lineHeight:1.75,whiteSpace:'pre-wrap'}}>{f.body||'(no body)'}</div>
              </div>
            ) : (
              <textarea
                value={f.body??''} onChange={e=>set('body',e.target.value)}
                rows={f.channel==='whatsapp'?6:10}
                placeholder={f.channel==='whatsapp'
                  ? 'Hello {{parent_name}}, {{student_name}} has been registered successfully!'
                  : 'Dear {{parent_name}},\n\nThank you for registering {{student_name}}…'}
                style={{...inp,resize:'vertical',lineHeight:1.65}}/>
            )}

            {f.channel==='whatsapp' && f.body && (
              <div style={{marginTop:10,padding:14,background:'#0B1418',borderRadius:10,borderLeft:'3px solid #25D366'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#25D366',marginBottom:6,fontFamily:'DM Sans,sans-serif',letterSpacing:'0.1em',textTransform:'uppercase'}}>Preview</div>
                <div style={{background:'#1F2C34',borderRadius:'12px 12px 12px 2px',padding:'10px 14px',maxWidth:280,display:'inline-block'}}>
                  <div style={{fontSize:12,color:'#E9EDEF',lineHeight:1.65,whiteSpace:'pre-wrap',fontFamily:'DM Sans,sans-serif'}}
                    dangerouslySetInnerHTML={{__html:f.body.replace(/\*(.+?)\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>')}}/> 
                  <div style={{fontSize:10,color:'#8696A0',marginTop:4,textAlign:'right'}}>12:34 ✓✓</div>
                </div>
              </div>
            )}
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>Active</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)'}}>Inactive templates won't be sent even if a trigger fires</div>
            </div>
            <div onClick={()=>set('is_active',!f.is_active)}
              style={{width:44,height:24,borderRadius:12,background:f.is_active?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:f.is_active?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
          </div>
        </div>
        <div style={{padding:'16px 24px',borderTop:'1.5px solid var(--bd)',display:'flex',justifyContent:'flex-end',gap:10,position:'sticky',bottom:0,background:'var(--card)'}}>
          <button onClick={onClose} style={{padding:'9px 20px',borderRadius:9,border:'1.5px solid var(--bd)',background:'var(--card)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',color:'var(--m)'}}>Cancel</button>
          <button onClick={()=>onSave(f)} disabled={!f.name||!f.body}
            style={{padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:!f.name||!f.body?.trim()?.length?0.5:1}}>
            {initial?.id?'Save Changes':'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trigger Form Modal ────────────────────────────────────────────────────────
function TriggerModal({initial,templates,schools,onClose,onSave}:{
  initial?:Trigger; templates:Template[]; schools:Row[];
  onClose:()=>void; onSave:(d:Partial<Trigger>)=>void;
}) {
  const [f,setF] = useState<Partial<Trigger>>(initial??{
    event_type:'registration.created',
    channel:'email',
    is_active:true,
    school_id:null,
    recipient_type:'student',
  });
  const set = (k:keyof Trigger,v:any)=>setF(p=>({...p,[k]:v}));

  const channelTemplates = templates.filter(t=>t.channel===f.channel&&t.is_active);
  const isSchoolOnlyEvent = SCHOOL_ONLY_EVENTS.has(f.event_type ?? '');

  // When event changes to school-only, force recipient_type to 'school'
  function handleEventChange(newEvent: string) {
    setF(p => ({
      ...p,
      event_type: newEvent,
      recipient_type: SCHOOL_ONLY_EVENTS.has(newEvent) ? 'school' : (p.recipient_type ?? 'student'),
    }));
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--card)',borderRadius:18,width:'100%',maxWidth:560,boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1.5px solid var(--bd)'}}>
          <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)'}}>{initial?.id?'Edit Trigger':'Add Trigger'}</div>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'var(--m)',fontSize:20}}>✕</button>
        </div>
        <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>

          {/* Event */}
          <div>
            <label style={lbl}>Event *</label>
            <select value={f.event_type??'registration.created'} onChange={e=>handleEventChange(e.target.value)}
              style={{...inp,cursor:'pointer'}}>
              {EVENT_TYPES.map(et=>(
                <option key={et.key} value={et.key}>{et.label}</option>
              ))}
            </select>
            <p style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:4}}>
              {EVENT_TYPES.find(e=>e.key===f.event_type)?.desc}
            </p>
          </div>

          {/* Channel */}
          <div>
            <label style={lbl}>Channel *</label>
            <div style={{display:'flex',gap:8}}>
              {(['email','whatsapp'] as Channel[]).map(c=>(
                <button key={c} onClick={()=>{ set('channel',c); set('template_id',null); }}
                  style={{flex:1,padding:'10px 0',borderRadius:8,border:`1.5px solid ${f.channel===c?CHANNEL_COLOR[c]:'var(--bd)'}`,background:f.channel===c?CHANNEL_COLOR[c]+'20':'var(--card)',color:f.channel===c?CHANNEL_COLOR[c]:'var(--m)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  {c==='email'?'📧':'💬'} {c}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient Type — only shown for registration/payment events */}
          {!isSchoolOnlyEvent && (
            <div>
              <label style={lbl}>Send To *</label>
              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={()=>set('recipient_type','student')}
                  style={{
                    flex:1,padding:'10px 12px',borderRadius:8,textAlign:'left',
                    border:`1.5px solid ${f.recipient_type==='student'?'var(--acc)':'var(--bd)'}`,
                    background:f.recipient_type==='student'?'var(--acc3)':'var(--card)',
                    cursor:'pointer',
                  }}>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:f.recipient_type==='student'?'var(--acc)':'var(--text)'}}>
                    🎓 Student
                  </div>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>
                    Student's email / phone from registration
                  </div>
                </button>
                <button
                  onClick={()=>set('recipient_type','school')}
                  style={{
                    flex:1,padding:'10px 12px',borderRadius:8,textAlign:'left',
                    border:`1.5px solid ${f.recipient_type==='school'?'var(--acc)':'var(--bd)'}`,
                    background:f.recipient_type==='school'?'var(--acc3)':'var(--card)',
                    cursor:'pointer',
                  }}>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:f.recipient_type==='school'?'var(--acc)':'var(--text)'}}>
                    🏫 School Coordinator
                  </div>
                  <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>
                    School contact person email / phone
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Template */}
          <div>
            <label style={lbl}>Template *</label>
            <select value={f.template_id??''} onChange={e=>set('template_id',e.target.value||null)}
              style={{...inp,cursor:'pointer'}}>
              <option value="">— Select template —</option>
              {channelTemplates.map(t=>(
                <option key={t.id} value={t.id}>{t.name} {t.channel==='email'?`(${t.subject?.slice(0,40)}…)`:''}</option>
              ))}
            </select>
            {channelTemplates.length===0 && (
              <p style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--red)',marginTop:4}}>
                ⚠ No active {f.channel} templates. Create one in the Templates tab first.
              </p>
            )}
          </div>

          {/* Active toggle */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>Active</div>
            <div onClick={()=>set('is_active',!f.is_active)}
              style={{width:44,height:24,borderRadius:12,background:f.is_active?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:f.is_active?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
          </div>
        </div>
        <div style={{padding:'16px 24px',borderTop:'1.5px solid var(--bd)',display:'flex',justifyContent:'flex-end',gap:10}}>
          <button onClick={onClose} style={{padding:'9px 20px',borderRadius:9,border:'1.5px solid var(--bd)',background:'var(--card)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',color:'var(--m)'}}>Cancel</button>
          <button onClick={()=>onSave(f)} disabled={!f.template_id}
            style={{padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:!f.template_id?0.5:1}}>
            {initial?.id?'Save Changes':'Create Trigger'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MessageTriggersPage() {
  const {toast,show:showToast} = useToast();
  const [tab, setTab] = useState<'templates'|'triggers'>('templates');

  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [triggers,    setTriggers]    = useState<Trigger[]>([]);
  const [schools,     setSchools]     = useState<Row[]>([]);
  const [activeTrigger, setActiveTrig] = useState<Trigger|null>(null);

  const [templateModal, setTemplateModal] = useState<Template|true|null>(null);
  const [triggerModal,  setTriggerModal]  = useState<Trigger|true|null>(null);

  const [channelFilter, setChannelFilter] = useState<Channel|'all'>('all');

  const load = useCallback(async()=>{
    const [td,trd,sd] = await Promise.all([
      authFetch(`${BACKEND}/api/admin/templates`).then(r=>r.json()),
      authFetch(`${BACKEND}/api/admin/triggers`).then(r=>r.json()),
      authFetch(`${BACKEND}/api/admin/schools`).then(r=>r.json()),
    ]);
    setTemplates(td.templates??[]);
    setTriggers(trd.triggers??[]);
    setSchools(sd.schools??[]);
    if (!activeTrigger && (trd.triggers??[]).length) setActiveTrig((trd.triggers??[])[0]);
  },[activeTrigger]);

  useEffect(()=>{ load(); },[]);

  async function saveTemplate(data:Partial<Template>) {
    const method = (data as any).id ? 'PATCH' : 'POST';
    const res = await authFetch(`${BACKEND}/api/admin/templates`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if (res.ok) { showToast('✅ Template saved!'); load(); setTemplateModal(null); }
    else { const e=await res.json(); showToast('❌ '+e.error); }
  }

  async function deleteTemplate(id:string) {
    if (!confirm('Delete this template?')) return;
    await authFetch(`${BACKEND}/api/admin/templates`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    showToast('🗑 Template deleted'); load();
  }

  async function saveTrigger(data:Partial<Trigger>) {
    const method = (data as any).id ? 'PATCH' : 'POST';
    const res = await authFetch(`${BACKEND}/api/admin/triggers`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if (res.ok) { showToast('✅ Trigger saved!'); load(); setTriggerModal(null); }
    else { const e=await res.json(); showToast('❌ '+e.error); }
  }

  async function deleteTrigger(id:string) {
    if (!confirm('Delete this trigger?')) return;
    await authFetch(`${BACKEND}/api/admin/triggers`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    showToast('🗑 Trigger deleted'); load();
  }

  const filteredTriggers = triggers.filter(t=>channelFilter==='all'||t.channel===channelFilter);
  const emailOn  = triggers.filter(t=>t.channel==='email'&&t.is_active).length;
  const waOn     = triggers.filter(t=>t.channel==='whatsapp'&&t.is_active).length;

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>
      {toast && (
        <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      <div style={{maxWidth:1100,margin:'0 auto',padding:'32px 24px'}}>
        {/* Header */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'Sora,sans-serif',fontSize:26,fontWeight:800,color:'var(--text)',margin:'0 0 4px'}}>
            Message <span style={{color:'var(--acc)'}}>Triggers</span>
          </h1>
          <p style={{fontSize:13,color:'var(--m)',margin:0}}>
            Auto-send emails & WhatsApp messages when registration or payment events happen
          </p>
        </div>

        {/* Tab bar */}
        <div style={{display:'flex',gap:8,marginBottom:24}}>
          {[
            {k:'templates' as const, icon:'✉️', label:'Message Templates', count:templates.length},
            {k:'triggers'  as const, icon:'🔔', label:'Triggers',          count:triggers.filter(t=>t.is_active).length},
          ].map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,
                border:`1.5px solid ${tab===t.k?'var(--acc)':'var(--bd)'}`,
                background:tab===t.k?'var(--acc3)':'var(--card)',
                color:tab===t.k?'var(--acc)':'var(--text)',
                fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              {t.icon} {t.label}
              {t.count>0&&<span style={{padding:'1px 7px',borderRadius:100,background:'var(--acc)',color:'#fff',fontSize:10,fontWeight:700}}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* ── TEMPLATES TAB ── */}
        {tab==='templates' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,padding:'12px 16px',background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12}}>
              <div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>
                  {templates.length===0?'No templates yet':''+templates.length+' template'+(templates.length!==1?'s':'')+' · '+templates.filter(t=>t.is_active).length+' active'}
                </div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>
                  💡 Use {'{{variable}}'} placeholders. Templates are linked to Triggers.
                </div>
              </div>
              <button onClick={()=>setTemplateModal(true)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 20px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
                + New Template
              </button>
            </div>

            {templates.length===0 ? (
              <div style={{textAlign:'center',padding:64,background:'var(--card)',borderRadius:16,border:'1.5px dashed var(--bd)'}}>
                <div style={{fontSize:40,marginBottom:12}}>✉️</div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:6}}>No templates yet</div>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--m)',marginBottom:22}}>Create email or WhatsApp templates. Use {'{{student_name}}'} etc. as placeholders.</div>
                <button onClick={()=>setTemplateModal(true)}
                  style={{display:'inline-flex',alignItems:'center',gap:7,padding:'10px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
                  + Create First Template
                </button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {templates.map(t=>{
                  const color = CHANNEL_COLOR[t.channel];
                  return (
                    <div key={t.id} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:14,padding:'15px 20px',display:'flex',alignItems:'center',gap:14,opacity:t.is_active?1:.7}}>
                      <span style={{fontSize:20,flexShrink:0}}>{t.channel==='email'?'📧':'💬'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:4}}>
                          <span style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,color:'var(--text)'}}>{t.name}</span>
                          <span style={{padding:'2px 8px',borderRadius:100,background:color+'20',color,fontSize:11,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>{t.channel}</span>
                          {t.is_active
                            ? <span style={{padding:'2px 8px',borderRadius:100,background:'rgba(16,185,129,.1)',color:'#15803d',fontSize:11,fontWeight:700}}>Active</span>
                            : <span style={{padding:'2px 8px',borderRadius:100,background:'var(--bd)',color:'var(--m)',fontSize:11,fontWeight:700}}>Inactive</span>}
                        </div>
                        {t.subject && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--m)',marginBottom:2}}>📨 {t.subject}</div>}
                        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:500}}>{t.body?.slice(0,100)}…</div>
                      </div>
                      <div style={{display:'flex',gap:8,flexShrink:0}}>
                        <button onClick={()=>setTemplateModal(t)} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid var(--bd)',background:'var(--card)',color:'var(--acc)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>Edit</button>
                        <button onClick={()=>deleteTemplate(t.id)} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid var(--red2)',background:'var(--red2)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TRIGGERS TAB ── */}
        {tab==='triggers' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>
                  📧 {emailOn} email · 💬 {waOn} WhatsApp active
                </div>
                {(['all','email','whatsapp'] as const).map(ch=>(
                  <button key={ch} onClick={()=>setChannelFilter(ch)}
                    style={{padding:'5px 12px',borderRadius:20,border:`1.5px solid ${channelFilter===ch?(ch==='all'?'var(--acc)':CHANNEL_COLOR[ch as Channel]):'var(--bd)'}`,background:channelFilter===ch?'rgba(79,70,229,.08)':'transparent',color:channelFilter===ch?'var(--acc)':'var(--m)',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    {ch==='all'?'All':ch==='email'?'📧 Email':'💬 WhatsApp'}
                  </button>
                ))}
              </div>
              <button onClick={()=>setTriggerModal(true)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'9px 20px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
                + Add Trigger
              </button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,alignItems:'start'}}>

              {/* Trigger list */}
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:14,overflow:'hidden'}}>
                <div style={{padding:'10px 14px',borderBottom:'1.5px solid var(--bd)'}}>
                  <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--m)',fontFamily:'DM Sans,sans-serif'}}>
                    {filteredTriggers.length} trigger{filteredTriggers.length!==1?'s':''}
                  </span>
                </div>
                {filteredTriggers.length===0 ? (
                  <div style={{padding:24,textAlign:'center',color:'var(--m)',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>
                    {triggers.length===0?'No triggers yet — add one!':'No triggers for this filter'}
                  </div>
                ) : filteredTriggers.map(t=>{
                  const isActive = activeTrigger?.id===t.id;
                  const color = CHANNEL_COLOR[t.channel];
                  const eventDef = EVENT_TYPES.find(e=>e.key===t.event_type);
                  return (
                    <button key={t.id} onClick={()=>setActiveTrig(t)}
                      style={{width:'100%',display:'flex',alignItems:'center',gap:9,padding:'11px 14px',border:'none',textAlign:'left',
                        background:isActive?'var(--acc3)':'transparent',
                        borderLeft:`3px solid ${isActive?'var(--acc)':'transparent'}`,
                        cursor:'pointer',transition:'all .12s'}}>
                      <span style={{fontSize:16,flexShrink:0}}>{t.channel==='email'?'📧':'💬'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:isActive?'var(--acc)':'var(--text)',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {eventDef?.label??t.event_type}
                        </div>
                        <div style={{fontSize:10,color:'var(--m)',fontFamily:'DM Sans,sans-serif',marginTop:1}}>
                          {t.notification_templates?.name??'No template'} · {
                            SCHOOL_ONLY_EVENTS.has(t.event_type) ? '🏫 School' :
                            t.recipient_type === 'school' ? '🏫 School Coordinator' : '🎓 Student'
                          }
                        </div>
                      </div>
                      <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:t.is_active?'#10b981':'var(--bd)'}}/>
                    </button>
                  );
                })}
              </div>

              {/* Detail panel */}
              {activeTrigger ? (
                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:14,padding:20}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                    <div>
                      <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)',marginBottom:4}}>
                        {EVENT_TYPES.find(e=>e.key===activeTrigger.event_type)?.label??activeTrigger.event_type}
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <span style={{padding:'2px 8px',borderRadius:100,background:CHANNEL_COLOR[activeTrigger.channel]+'20',color:CHANNEL_COLOR[activeTrigger.channel],fontSize:11,fontWeight:700}}>
                          {activeTrigger.channel==='email'?'📧':'💬'} {activeTrigger.channel}
                        </span>
                        <span style={{padding:'2px 8px',borderRadius:100,background:activeTrigger.is_active?'rgba(16,185,129,.1)':'var(--bd)',color:activeTrigger.is_active?'#15803d':'var(--m)',fontSize:11,fontWeight:700}}>
                          {activeTrigger.is_active?'Active':'Inactive'}
                        </span>
                        <span style={{padding:'2px 8px',borderRadius:100,background:'rgba(99,102,241,.08)',color:'var(--acc)',fontSize:11,fontWeight:700}}>
                          {SCHOOL_ONLY_EVENTS.has(activeTrigger.event_type)
                            ? '🏫 School Coordinator'
                            : activeTrigger.recipient_type === 'school'
                              ? '🏫 School Coordinator'
                              : '🎓 Student'}
                        </span>
                        <span style={{padding:'2px 8px',borderRadius:100,background:'var(--bg)',color:'var(--m)',fontSize:11}}>
                          {activeTrigger.school_id ? schools.find(s=>s.id===activeTrigger.school_id)?.name??'Specific school' : 'All schools'}
                        </span>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>setTriggerModal(activeTrigger)} style={{padding:'7px 14px',borderRadius:8,border:'1.5px solid var(--bd)',background:'var(--card)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>✏️ Edit</button>
                      <button onClick={()=>deleteTrigger(activeTrigger.id)} style={{padding:'7px 14px',borderRadius:8,border:'1.5px solid var(--red2)',background:'var(--red2)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>🗑 Delete</button>
                    </div>
                  </div>

                  {activeTrigger.notification_templates ? (() => {
                    const tmpl = templates.find(t=>t.id===activeTrigger.template_id);
                    return tmpl ? (
                      <div>
                        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--m)',marginBottom:10}}>Template Preview</div>
                        {tmpl.subject && <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:8,padding:'8px 12px',background:'var(--bg)',borderRadius:8}}>📨 {tmpl.subject}</div>}
                        <div style={{padding:14,background:'var(--bg)',borderRadius:10,fontSize:13,color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap',fontFamily:'DM Sans,sans-serif'}}>
                          {tmpl.body}
                        </div>
                        {tmpl.channel==='whatsapp' && (
                          <div style={{marginTop:12,padding:14,background:'#0B1418',borderRadius:10,borderLeft:'3px solid #25D366'}}>
                            <div style={{fontSize:10,fontWeight:700,color:'#25D366',marginBottom:6,letterSpacing:'0.1em',textTransform:'uppercase'}}>WhatsApp Bubble</div>
                            <div style={{background:'#1F2C34',borderRadius:'12px 12px 12px 2px',padding:'10px 14px',maxWidth:280,display:'inline-block'}}>
                              <div style={{fontSize:12,color:'#E9EDEF',lineHeight:1.65,whiteSpace:'pre-wrap'}}
                                dangerouslySetInnerHTML={{__html:tmpl.body.replace(/\*(.+?)\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>')}}/> 
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })() : (
                    <div style={{padding:24,textAlign:'center',color:'var(--m)',fontSize:12}}>
                      ⚠️ No template linked. Edit this trigger to assign a template.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:14,padding:48,textAlign:'center',color:'var(--m)',fontSize:13}}>
                  {triggers.length===0?'Create your first trigger to get started':'Select a trigger from the list'}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{marginTop:24}}>
          <a href="/admin" style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'var(--acc)',textDecoration:'none',fontWeight:600}}>← Back to Admin Dashboard</a>
        </div>
      </div>

      {templateModal && (
        <TemplateModal
          initial={templateModal===true?undefined:templateModal}
          onClose={()=>setTemplateModal(null)}
          onSave={saveTemplate}
        />
      )}
      {triggerModal && (
        <TriggerModal
          initial={triggerModal===true?undefined:triggerModal}
          templates={templates}
          schools={schools}
          onClose={()=>setTriggerModal(null)}
          onSave={saveTrigger}
        />
      )}
    </div>
  );
}
