'use client';
import { authFetch } from '@/lib/supabase/client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
type Row = Record<string, any>;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

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
const btn = (active=false, color='var(--acc)'): React.CSSProperties => ({
  display:'flex', alignItems:'center', gap:8, padding:'10px 20px',
  borderRadius:10, border:`1.5px solid ${active ? color : 'var(--bd)'}`,
  background: active ? color+'20' : 'var(--card)',
  color: active ? color : 'var(--text)',
  fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer',
});

// ── Gateway / Provider metadata ──────────────────────────────────────────────
const GATEWAY_META: Record<string,{
  name:string; logo:string; color:string; bg:string;
  description:string; domestic:boolean; international:boolean;
  fields:Array<{key:string; label:string; hint:string; secret?:boolean}>;
  docs:string;
}> = {
  razorpay: {
    name:'Razorpay', logo:'💙', color:'#3395FF', bg:'rgba(51,149,255,.08)',
    description:"India's most popular gateway. Cards, UPI, netbanking, wallets.",
    domestic:true, international:false,
    fields:[
      {key:'key_id',     label:'Key ID',     hint:'Starts with rzp_live_ or rzp_test_'},
      {key:'key_secret', label:'Key Secret', hint:'From Razorpay Dashboard → API Keys', secret:true},
    ],
    docs:'https://razorpay.com/docs/payments/dashboard/account-access/api-key/',
  },
  cashfree: {
    name:'Cashfree', logo:'💚', color:'#00C853', bg:'rgba(0,200,83,.08)',
    description:'Fast settlement, UPI AutoPay & subscriptions. Good for recurring billing.',
    domestic:true, international:false,
    fields:[
      {key:'key_id',     label:'App ID',     hint:'From Cashfree Dashboard → Credentials'},
      {key:'key_secret', label:'Secret Key', hint:'From Cashfree Dashboard → Credentials', secret:true},
    ],
    docs:'https://docs.cashfree.com/docs/getting-started',
  },
  easebuzz: {
    name:'Easebuzz', logo:'🟠', color:'#FF6600', bg:'rgba(255,102,0,.08)',
    description:'Cost-effective with low MDR. Popular with EdTech platforms.',
    domestic:true, international:false,
    fields:[
      {key:'key_id',     label:'Merchant Key', hint:'Easebuzz Dashboard → Settings → API Keys'},
      {key:'key_secret', label:'Salt',          hint:'Easebuzz salt for hash generation', secret:true},
    ],
    docs:'https://docs.easebuzz.in/payments',
  },
  paypal: {
    name:'PayPal', logo:'🌐', color:'#003087', bg:'rgba(0,48,135,.08)',
    description:'International payments (USD/AED/SAR). Best for overseas schools.',
    domestic:false, international:true,
    fields:[
      {key:'key_id',     label:'Client ID',     hint:'PayPal Developer Dashboard → Apps'},
      {key:'key_secret', label:'Client Secret', hint:'PayPal Developer Dashboard → Apps', secret:true},
    ],
    docs:'https://developer.paypal.com/api/rest/',
  },
  smtp: {
    name:'Gmail SMTP', logo:'📧', color:'#EA4335', bg:'rgba(234,67,53,.08)',
    description:'Send confirmation emails via Gmail using an App Password.',
    domestic:false, international:false,
    fields:[
      {key:'from_name',  label:'Sender Name',  hint:'e.g. Thynk Registration'},
      {key:'from_email', label:'From Email',   hint:'e.g. noreply@yourdomain.com'},
      {key:'smtp_host',  label:'SMTP Host',    hint:'smtp.gmail.com'},
      {key:'smtp_port',  label:'SMTP Port',    hint:'587'},
      {key:'smtp_user',  label:'Gmail Address',hint:'your@gmail.com'},
      {key:'smtp_pass',  label:'App Password', hint:'16-char Google App Password', secret:true},
    ],
    docs:'https://support.google.com/accounts/answer/185833',
  },
  whatsapp_cloud: {
    name:'Meta WhatsApp', logo:'💬', color:'#25D366', bg:'rgba(37,211,102,.08)',
    description:'Send WhatsApp messages to parents on registration & payment events.',
    domestic:false, international:false,
    fields:[
      {key:'access_token',   label:'Access Token',   hint:'Permanent System User token from Meta'},
      {key:'phone_number_id',label:'Phone Number ID', hint:'Meta → WhatsApp → API Setup'},
    ],
    docs:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  },
  twilio: {
    name:'Twilio WhatsApp', logo:'🔴', color:'#F22F46', bg:'rgba(242,47,70,.08)',
    description:'Twilio WhatsApp sandbox & production for international setups.',
    domestic:false, international:false,
    fields:[
      {key:'account_sid', label:'Account SID',  hint:'Twilio Console → Account Info'},
      {key:'auth_token',  label:'Auth Token',   hint:'Twilio Console → Account Info', secret:true},
      {key:'from_number', label:'From Number',  hint:'whatsapp:+14155238886'},
    ],
    docs:'https://www.twilio.com/docs/whatsapp',
  },
};

// ── Secret Field ─────────────────────────────────────────────────────────────
function SecretField({label,hint,value,onChange}:{label:string;hint:string;value:string;onChange:(v:string)=>void}) {
  const [show,setShow] = useState(false);
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{position:'relative'}}>
        <input type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)}
          placeholder={hint}
          style={{...inp, paddingRight:40, fontFamily:show?'monospace':'DM Sans,sans-serif', fontSize:12}} />
        <button type="button" onClick={()=>setShow(!show)}
          style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{hint}</p>
    </div>
  );
}

// ── Integration Card ─────────────────────────────────────────────────────────
function IntegCard({provider,cfg,onEdit,onToggle}:{provider:string;cfg?:Row;onEdit:()=>void;onToggle:()=>void}) {
  const meta = GATEWAY_META[provider];
  if (!meta) return null;
  const isActive = cfg?.is_active;
  const isConfigured = !!(cfg?.config && Object.keys(cfg.config).length > 0);

  return (
    <div style={{
      background:'var(--card)', border:`1.5px solid ${isActive ? meta.color+'40' : 'var(--bd)'}`,
      borderRadius:14, overflow:'hidden', transition:'border-color .2s',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 18px',background:isActive?meta.bg:'transparent'}}>
        <span style={{fontSize:26,flexShrink:0}}>{meta.logo}</span>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
            <span style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,color:'var(--text)'}}>{meta.name}</span>
            {meta.domestic && <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(16,185,129,.1)',color:'#15803d',fontFamily:'DM Sans,sans-serif'}}>Domestic</span>}
            {meta.international && <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(59,130,246,.1)',color:'#1d4ed8',fontFamily:'DM Sans,sans-serif'}}>International</span>}
            {isConfigured
              ? <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(16,185,129,.1)',color:'#15803d',fontFamily:'DM Sans,sans-serif'}}>✓ Configured</span>
              : <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(239,68,68,.1)',color:'#dc2626',fontFamily:'DM Sans,sans-serif'}}>Not set up</span>}
          </div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)'}}>{meta.description}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <div onClick={onToggle}
            style={{width:40,height:22,borderRadius:11,background:isActive?meta.color:'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s'}}>
            <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:isActive?21:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
          </div>
          <button onClick={onEdit} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid var(--bd)',background:'var(--card)',color:'var(--acc)',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            {isConfigured ? 'Edit' : 'Set Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({provider,cfg,onClose,onSave}:{provider:string;cfg?:Row;onClose:()=>void;onSave:(d:Row)=>void}) {
  const meta = GATEWAY_META[provider];
  const initConfig = cfg?.config ?? {};
  const [config,setConfig] = useState<Record<string,string>>(
    Object.fromEntries(meta.fields.map(f=>[f.key, initConfig[f.key]??'']))
  );
  const [mode,setMode] = useState<'live'|'test'>(cfg?.config?.mode??'test');

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'var(--card)',borderRadius:18,width:'100%',maxWidth:560,maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1.5px solid var(--bd)',position:'sticky',top:0,background:'var(--card)',zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:24}}>{meta.logo}</span>
            <div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:16,color:'var(--text)'}}>{meta.name} Settings</div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)'}}>
                <a href={meta.docs} target="_blank" rel="noreferrer" style={{color:'var(--acc)',textDecoration:'none'}}>📖 View Docs →</a>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'var(--m)',fontSize:20}}>✕</button>
        </div>
        <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>
          {/* Mode toggle — only for payment gateways */}
          {['razorpay','cashfree','easebuzz','paypal'].includes(provider) && (
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
              <span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,color:'var(--m)'}}>Mode:</span>
              {(['test','live'] as const).map(m=>(
                <button key={m} onClick={()=>setMode(m)}
                  style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',
                    fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,
                    background:mode===m?(m==='live'?'#B8860B':'var(--text)'):'transparent',
                    color:mode===m?'#fff':'var(--m)'}}>
                  {m==='live'?'🌐 Live':'🧪 Test / Sandbox'}
                </button>
              ))}
              {mode==='live'&&<span style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--red)',fontWeight:600}}>⚠ Real money — double-check keys</span>}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:meta.fields.length>2?'1fr 1fr':'1fr',gap:14}}>
            {meta.fields.map(f=> f.secret
              ? <SecretField key={f.key} label={f.label} hint={f.hint} value={config[f.key]??''} onChange={v=>setConfig(p=>({...p,[f.key]:v}))}/>
              : (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input type="text" value={config[f.key]??''} onChange={e=>setConfig(p=>({...p,[f.key]:e.target.value}))} placeholder={f.hint} style={inp}/>
                  <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{f.hint}</p>
                </div>
              )
            )}
          </div>
        </div>
        <div style={{padding:'16px 24px',borderTop:'1.5px solid var(--bd)',display:'flex',justifyContent:'flex-end',gap:10}}>
          <button onClick={onClose} style={{padding:'9px 20px',borderRadius:9,border:'1.5px solid var(--bd)',background:'var(--card)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',color:'var(--m)'}}>Cancel</button>
          <button onClick={()=>onSave({
            provider, config:{...config,mode},
            is_active: cfg?.is_active ?? false,
            priority: cfg?.priority ?? 1,
            ...(cfg?.id ? {id:cfg.id} : {}),
          })} style={{padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [tab,    setTab]    = useState<'payments'|'email'|'whatsapp'>('payments');
  const [intgs,  setIntgs]  = useState<Row[]>([]);
  const [modal,  setModal]  = useState<{provider:string;cfg?:Row}|null>(null);
  const [toast,  setToast]  = useState('');
  const toastRef = useRef<any>();

  function showToast(msg:string) {
    setToast(msg); clearTimeout(toastRef.current);
    toastRef.current = setTimeout(()=>setToast(''),3000);
  }

  const load = useCallback(async()=>{
    const r = await authFetch(`${BACKEND}/api/admin/integrations`);
    const d = await r.json();
    setIntgs(d.integrations??[]);
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function handleToggle(provider:string) {
    const cfg = intgs.find(i=>i.provider===provider);
    if (!cfg) return;
    await authFetch(`${BACKEND}/api/admin/integrations`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:cfg.id,is_active:!cfg.is_active}),
    });
    load();
  }

  async function handleSave(data:Row) {
    const method = data.id ? 'PATCH' : 'POST';
    const res = await authFetch(`${BACKEND}/api/admin/integrations`,{
      method,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data),
    });
    if (res.ok) { showToast('✅ Integration saved!'); load(); setModal(null); }
    else { const e = await res.json(); showToast('❌ '+e.error); }
  }

  const TABS = [
    {k:'payments' as const, icon:'💳', label:'Payment Gateways', providers:['razorpay','cashfree','easebuzz','paypal']},
    {k:'email'    as const, icon:'📧', label:'Email',            providers:['smtp']},
    {k:'whatsapp' as const, icon:'💬', label:'WhatsApp',         providers:['whatsapp_cloud','twilio']},
  ];
  const activeTab = TABS.find(t=>t.k===tab)!;
  const activeCount = intgs.filter(i=>i.is_active).length;

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>
      {toast && (
        <div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toast}
        </div>
      )}

      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}>
        {/* Header */}
        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'Sora,sans-serif',fontSize:26,fontWeight:800,color:'var(--text)',margin:'0 0 4px'}}>
            Integrations <span style={{color:'var(--acc)'}}>Setup</span>
          </h1>
          <p style={{fontSize:13,color:'var(--m)',margin:0}}>
            Payment gateways, email & WhatsApp — {activeCount} active integration{activeCount!==1?'s':''}
          </p>
        </div>

        {/* Tab bar */}
        <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
          {TABS.map(t=>{
            const tabCount = intgs.filter(i=>t.providers.includes(i.provider)&&i.is_active).length;
            return (
              <button key={t.k} onClick={()=>setTab(t.k)} style={btn(tab===t.k)}>
                {t.icon} {t.label}
                {tabCount>0 && <span style={{padding:'1px 7px',borderRadius:100,background:'var(--acc)',color:'#fff',fontSize:10,fontWeight:700}}>{tabCount}</span>}
              </button>
            );
          })}
        </div>

        {/* Payment Gateways — drag priority info */}
        {tab==='payments' && (
          <div style={{marginBottom:16,padding:'12px 16px',background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16}}>💳</span>
            <div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>
                {activeCount===0 ? 'No gateways active — students cannot make payments' : `${intgs.filter(i=>i.is_active&&['razorpay','cashfree','easebuzz','paypal'].includes(i.provider)).length} gateway(s) active`}
              </div>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>
                Priority is set per-school in Schools → Edit School → Gateway Sequence.
              </div>
            </div>
          </div>
        )}

        {/* Cards */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {activeTab.providers.map(provider=>(
            <IntegCard
              key={provider}
              provider={provider}
              cfg={intgs.find(i=>i.provider===provider)}
              onEdit={()=>setModal({provider, cfg:intgs.find(i=>i.provider===provider)})}
              onToggle={()=>handleToggle(provider)}
            />
          ))}
        </div>

        {/* Back link */}
        <div style={{marginTop:24}}>
          <a href="/admin" style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'var(--acc)',textDecoration:'none',fontWeight:600}}>← Back to Admin Dashboard</a>
        </div>
      </div>

      {modal && (
        <EditModal
          provider={modal.provider}
          cfg={modal.cfg}
          onClose={()=>setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
