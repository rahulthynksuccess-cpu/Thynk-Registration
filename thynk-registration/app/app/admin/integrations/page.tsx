'use client';
export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/supabase/client';

type Row = Record<string, any>;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1.5px solid var(--bd)', borderRadius:9, fontSize:13, fontFamily:'DM Sans,sans-serif', color:'var(--text)', background:'var(--card)', outline:'none', boxSizing:'border-box' as const };
const lbl: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase' as const, color:'var(--m)', marginBottom:6, fontFamily:'DM Sans,sans-serif' };

// ── Payment Gateway metadata ─────────────────────────────────────────────────
const GATEWAY_META: Record<string,{name:string;logo:string;color:string;bg:string;description:string;domestic:boolean;international:boolean;fields:Array<{key:string;label:string;hint:string;secret?:boolean}>;docs:string;}> = {
  razorpay:{ name:'Razorpay', logo:'💙', color:'#3395FF', bg:'rgba(51,149,255,.08)', description:"India's most popular gateway. Cards, UPI, netbanking, wallets.", domestic:true, international:false, fields:[{key:'key_id',label:'Key ID',hint:'Starts with rzp_live_ or rzp_test_'},{key:'key_secret',label:'Key Secret',hint:'Razorpay Dashboard → API Keys',secret:true}], docs:'https://razorpay.com/docs/payments/dashboard/account-access/api-key/' },
  cashfree:{ name:'Cashfree', logo:'💚', color:'#00C853', bg:'rgba(0,200,83,.08)', description:'Fast settlement, UPI AutoPay & subscriptions.', domestic:true, international:false, fields:[{key:'key_id',label:'App ID',hint:'Cashfree Dashboard → Credentials'},{key:'key_secret',label:'Secret Key',hint:'Cashfree Dashboard → Credentials',secret:true}], docs:'https://docs.cashfree.com/docs/getting-started' },
  easebuzz:{ name:'Easebuzz', logo:'🟠', color:'#FF6600', bg:'rgba(255,102,0,.08)', description:'Cost-effective with low MDR. Popular with EdTech platforms.', domestic:true, international:false, fields:[{key:'key_id',label:'Merchant Key',hint:'Easebuzz Dashboard → Settings → API Keys'},{key:'key_secret',label:'Salt',hint:'Your Easebuzz salt for hash generation',secret:true}], docs:'https://docs.easebuzz.in/payments' },
  paypal:{ name:'PayPal', logo:'🌐', color:'#003087', bg:'rgba(0,48,135,.08)', description:'International payments (USD/AED/SAR). Best for overseas schools.', domestic:false, international:true, fields:[{key:'key_id',label:'Client ID',hint:'PayPal Developer Dashboard → Apps'},{key:'key_secret',label:'Client Secret',hint:'PayPal Developer Dashboard → Apps',secret:true}], docs:'https://developer.paypal.com/api/rest/' },
};
interface GatewayState { id:string; enabled:boolean; priority:number; key_id:string; key_secret:string; mode:'live'|'test'; pg_label?:string; db_id?:string; }

// ── WhatsApp providers ───────────────────────────────────────────────────────
const WA_PROVIDERS = {
  thynkcomm:{ label:'ThynkComm', badge:'⚡ Recommended', badgeColor:'#166534', badgeBg:'rgba(22,101,52,0.1)', iconBg:'linear-gradient(135deg,#1ab8a8,#0e8a7d)', icon:'💬', description:'Use your ThynkComm deployment as the WhatsApp channel. Authenticate with API Key + Secret from ThynkComm → Integrations.', docsUrl:'https://thynkcom.vercel.app', color:'#1ab8a8', colorBg:'rgba(26,184,168,0.08)', colorBorder:'rgba(26,184,168,0.3)' },
  meta:{ label:'Meta Cloud API', badge:'Direct', badgeColor:'#1d4ed8', badgeBg:'rgba(29,78,216,0.1)', iconBg:'linear-gradient(135deg,#1877F2,#0d47a1)', icon:'🔵', description:'Connect directly to Meta WhatsApp Business Cloud API with your Access Token and Phone Number ID.', docsUrl:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started', color:'#1877F2', colorBg:'rgba(24,119,242,0.08)', colorBorder:'rgba(24,119,242,0.3)' },
  twilio:{ label:'Twilio', badge:'International', badgeColor:'#6B21A8', badgeBg:'rgba(107,33,168,0.1)', iconBg:'linear-gradient(135deg,#F22F46,#a51829)', icon:'🔴', description:'Twilio WhatsApp sandbox and production. Best for international SMS+WhatsApp hybrid setups.', docsUrl:'https://www.twilio.com/docs/whatsapp', color:'#F22F46', colorBg:'rgba(242,47,70,0.08)', colorBorder:'rgba(242,47,70,0.3)' },
} as const;
type WaProvider = keyof typeof WA_PROVIDERS;
interface WaSettings { provider:WaProvider; enabled:boolean; tcUrl:string; tcApiKey:string; tcApiSecret:string; metaToken:string; metaPhoneId:string; accountSid:string; authToken:string; fromNumber:string; }
const WA_DEFAULTS:WaSettings = { provider:'thynkcomm', enabled:false, tcUrl:'', tcApiKey:'', tcApiSecret:'', metaToken:'', metaPhoneId:'', accountSid:'', authToken:'', fromNumber:'' };

function useToast() {
  const [toast,setToast] = useState('');
  const ref = useRef<ReturnType<typeof setTimeout>|null>(null);
  function show(msg:string){ setToast(msg); if(ref.current) clearTimeout(ref.current); ref.current=setTimeout(()=>setToast(''),3500); }
  return {toast,show};
}

function SecretField({label,hint,value,onChange}:{label:string;hint:string;value:string;onChange:(v:string)=>void}) {
  const [show,setShow]=useState(false);
  return (<div><label style={lbl}>{label}</label><div style={{position:'relative'}}><input type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} placeholder={hint} style={{...inp,paddingRight:40,fontFamily:show?'monospace':'DM Sans,sans-serif',fontSize:12}}/><button type="button" onClick={()=>setShow(!show)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>{show?'🙈':'👁️'}</button></div><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{hint}</p></div>);
}

function GatewayCard({gw,onUpdate,onMoveUp,onMoveDown,isFirst,isLast}:{gw:GatewayState;onUpdate:(id:string,patch:Partial<GatewayState>)=>void;onMoveUp:()=>void;onMoveDown:()=>void;isFirst:boolean;isLast:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const [testing,setTesting]=useState(false);
  const [testResult,setTestResult]=useState<{ok:boolean;msg:string}|null>(null);
  const meta=GATEWAY_META[gw.id]; if(!meta) return null;
  const isConfigured=!!(gw.key_id&&gw.key_secret);

  const runTest=async(e:React.MouseEvent)=>{
    e.stopPropagation();
    if(!isConfigured){setTestResult({ok:false,msg:'Enter Key ID and Secret first'});return;}
    setTesting(true);setTestResult(null);
    try{
      const res=await authFetch(`${BACKEND}/api/admin/integrations/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:gw.id,config:{key_id:gw.key_id,key_secret:gw.key_secret,mode:gw.mode}})});
      const d=await res.json();
      setTestResult({ok:d.success,msg:d.message||d.error||'Unknown result'});
    }catch(e:any){setTestResult({ok:false,msg:'Network error: '+e.message});}
    setTesting(false);
  };
  return (
    <div style={{background:'var(--card)',border:`1.5px solid ${gw.enabled?meta.color+'40':'var(--bd)'}`,borderRadius:14,overflow:'hidden',transition:'border-color .2s'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:gw.enabled?meta.bg:'transparent',cursor:'pointer'}} onClick={()=>setExpanded(!expanded)}>
        <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onMoveUp();}} disabled={isFirst} style={{padding:'1px 3px',border:'none',background:'transparent',cursor:isFirst?'default':'pointer',opacity:isFirst?0.2:0.7,fontSize:10}}>▲</button>
          <button onClick={e=>{e.stopPropagation();onMoveDown();}} disabled={isLast} style={{padding:'1px 3px',border:'none',background:'transparent',cursor:isLast?'default':'pointer',opacity:isLast?0.2:0.7,fontSize:10}}>▼</button>
        </div>
        <span style={{fontSize:14,color:'var(--m)',flexShrink:0,cursor:'grab',userSelect:'none'}}>⠿</span>
        <div style={{width:22,height:22,borderRadius:'50%',background:gw.enabled?meta.color:'var(--bd)',color:gw.enabled?'#fff':'var(--m)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{gw.priority}</div>
        <span style={{fontSize:20,flexShrink:0}}>{meta.logo}</span>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:2}}>
            <span style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,color:'var(--text)'}}>{meta.name}</span>
            {meta.domestic&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(16,185,129,.1)',color:'#15803d'}}>Domestic</span>}
            {meta.international&&<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(59,130,246,.1)',color:'#1d4ed8'}}>International</span>}
            {isConfigured?<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(16,185,129,.1)',color:'#15803d'}}>✓ Keys set</span>:<span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:'rgba(239,68,68,.1)',color:'#dc2626'}}>⚠ Not configured</span>}
          </div>
          <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)'}}>{meta.description}</div>
        </div>
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:gw.enabled?meta.color:'var(--m)',fontWeight:600}}>{gw.enabled?'Active':'Off'}</span>
          <div onClick={()=>onUpdate(gw.id,{enabled:!gw.enabled})} style={{width:40,height:22,borderRadius:11,background:gw.enabled?meta.color:'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}><div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:gw.enabled?21:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/></div>
        </div>
        <span style={{fontSize:11,color:'var(--m)',transform:expanded?'rotate(180deg)':'none',transition:'transform .2s',flexShrink:0}}>▼</span>
      </div>
      {expanded&&(
        <div style={{padding:20,borderTop:'1.5px solid var(--bd)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20,padding:'10px 14px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,color:'var(--m)'}}>Mode:</span>
            {(['test','live'] as const).map(m=>(<button key={m} onClick={()=>onUpdate(gw.id,{mode:m})} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,background:gw.mode===m?(m==='live'?'#B8860B':'var(--text)'):'transparent',color:gw.mode===m?'#fff':'var(--m)'}}>{m==='live'?'🌐 Live':'🧪 Test / Sandbox'}</button>))}
            {gw.mode==='live'&&<span style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--red)',fontWeight:600}}>⚠ Real money — double-check keys</span>}
          </div>
          {/* ── Checkout Label ───────────────────────────── */}
          <div style={{marginBottom:16,padding:'12px 14px',background:'var(--bg)',borderRadius:10,border:'1.5px solid var(--bd)'}}>
            <label style={lbl}>Checkout Label <span style={{fontSize:10,fontWeight:400,textTransform:'none',letterSpacing:0,color:'var(--m)'}}>— optional, shown on payment page alongside gateway name</span></label>
            <input type="text" value={gw.pg_label??''} onChange={e=>onUpdate(gw.id,{pg_label:e.target.value})} placeholder={`e.g. "Recommended" or "Fastest Refund" or "UPI Preferred"`} style={{...inp,marginBottom:4}}/>
            <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:0}}>Keep it short — 2 to 4 words max. Displays as a badge on this gateway's card at checkout.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            {meta.fields.map(f=>f.secret?<SecretField key={f.key} label={f.label} hint={f.hint} value={(gw as any)[f.key]||''} onChange={v=>onUpdate(gw.id,{[f.key]:v} as any)}/>:(<div key={f.key}><label style={lbl}>{f.label}</label><input type="text" value={(gw as any)[f.key]||''} onChange={e=>onUpdate(gw.id,{[f.key]:e.target.value} as any)} placeholder={f.hint} style={inp}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{f.hint}</p></div>))}
          </div>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <a href={meta.docs} target="_blank" rel="noreferrer" style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:meta.color,textDecoration:'none',fontWeight:600}}>📖 {meta.name} API docs →</a>
            <button onClick={runTest} disabled={testing} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 16px',borderRadius:8,border:`1.5px solid ${meta.color}`,background:'transparent',color:meta.color,cursor:testing?'not-allowed':'pointer',fontSize:12,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:testing?0.6:1}}>
              {testing?'⏳ Testing…':'🔌 Test Connection'}
            </button>
            {testResult&&(
              <span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:testResult.ok?'#15803d':'var(--red)',padding:'4px 10px',borderRadius:6,background:testResult.ok?'rgba(16,185,129,.08)':'rgba(239,68,68,.08)',border:`1px solid ${testResult.ok?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)'}`}}>
                {testResult.ok?'✅':'❌'} {testResult.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppTab({showToast}:{showToast:(m:string)=>void}) {
  const [wa,setWa]=useState<WaSettings>(WA_DEFAULTS);
  const [testing,setTesting]=useState(false);
  const [testPhone,setTestPhone]=useState('');
  const [testMsg,setTestMsg]=useState('Hello from Thynk Registration! Your WhatsApp integration is working. 🎉');
  const [testResult,setTestResult]=useState<{ok:boolean;msg:string;hint?:string;warning?:string;raw?:any}|null>(null);
  const [showSecret,setShowSecret]=useState(false);
  const [showToken,setShowToken]=useState(false);
  const [showRaw,setShowRaw]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    authFetch(`${BACKEND}/api/admin/settings`).then(r=>r.ok?r.json():null).then(d=>{if(d?.whatsapp_settings)setWa(p=>({...WA_DEFAULTS,...d.whatsapp_settings}));}).catch(()=>{});
  },[]);

  const set=(patch:Partial<WaSettings>)=>setWa(p=>({...p,...patch}));

  const save=async()=>{
    setSaving(true);
    try{const res=await authFetch(`${BACKEND}/api/admin/settings`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({whatsapp_settings:wa})});if(res.ok)showToast('✅ WhatsApp settings saved!');else{const e=await res.json().catch(()=>({}));showToast('❌ Save failed: '+(e.error||'HTTP '+res.status));}}catch(err:any){showToast('❌ Save failed: '+err.message);}
    setSaving(false);
  };

  const normalisePhone=(raw:string)=>{let d=raw.replace(/\D/g,'');if(d.length===10&&d[0]!=='0')d='91'+d;if(d.length===11&&d[0]==='0')d='91'+d.slice(1);return d;};
  const isConfigured=()=>{if(wa.provider==='thynkcomm')return!!(wa.tcUrl&&wa.tcApiKey&&wa.tcApiSecret);if(wa.provider==='meta')return!!(wa.metaToken&&wa.metaPhoneId);if(wa.provider==='twilio')return!!(wa.accountSid&&wa.authToken&&wa.fromNumber);return false;};

  const sendTest=async()=>{
    const ph=testPhone.trim();if(!ph){showToast('❌ Enter a test phone number');return;}if(!isConfigured()){showToast('❌ Configure and save credentials first');return;}
    const toNorm=normalisePhone(ph);if(toNorm.length<10||toNorm.length>15){setTestResult({ok:false,msg:`"${ph}" doesn't look like a valid phone number.`,hint:'Use country code + number without +, e.g. 919876543210. Indian 10-digit numbers are auto-prefixed.'});return;}
    setTesting(true);setTestResult(null);setShowRaw(false);
    try{
      let res:Response;
      if(wa.provider==='thynkcomm'){const url=wa.tcUrl.replace(/\/$/,'')+'/api/send-message';res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':wa.tcApiKey,'x-api-secret':wa.tcApiSecret},body:JSON.stringify({to:toNorm,message:testMsg})});}
      else if(wa.provider==='meta'){res=await fetch(`https://graph.facebook.com/v19.0/${wa.metaPhoneId}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${wa.metaToken}`},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:toNorm,type:'text',text:{preview_url:false,body:testMsg}})});}
      else{const creds=btoa(`${wa.accountSid}:${wa.authToken}`);const from=wa.fromNumber.startsWith('whatsapp:')?wa.fromNumber:`whatsapp:${wa.fromNumber}`;res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${creds}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({From:from,To:`whatsapp:${toNorm}`,Body:testMsg})});}
      let data:any={};const ct=res.headers.get('content-type')||''
      if(ct.includes('application/json')){data=await res.json();}else{const text=await res.text().catch(()=>'');if(!res.ok){setTestResult({ok:false,msg:`Server returned non-JSON (HTTP ${res.status}).`,hint:wa.provider==='thynkcomm'?`Check ThynkComm URL: ${wa.tcUrl}.`:`Status: ${res.status}.`,raw:{status:res.status,body:text.slice(0,300)}});setTesting(false);return;}}
      if(!res.ok){const errMsg=data.error||data.message||data.error_description||'Unknown error';setTestResult({ok:false,msg:errMsg,hint:data.hint||data.more_info||'',raw:data});showToast('❌ Send failed');}
      else{const warning=data.warning||(wa.provider==='meta'?'Message accepted. If recipient has not messaged you in 24h, use a Template for first-contact sends.':undefined);setTestResult({ok:true,msg:`Message accepted ✓ → to: ${toNorm} (id: ${data.messageId||data.messages?.[0]?.id||data.sid||'n/a'})`,warning,raw:data});showToast('✅ Message queued for delivery');}
    }catch(e:any){setTestResult({ok:false,msg:'Network error: '+e.message,hint:'Check that your ThynkComm URL is correct and accessible.'});}
    setTesting(false);
  };

  const prov=WA_PROVIDERS[wa.provider];
  const provs=Object.entries(WA_PROVIDERS) as [WaProvider,typeof WA_PROVIDERS[WaProvider]][];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* Provider selector */}
      <div style={{background:'var(--card)',borderRadius:16,border:'1.5px solid var(--bd)',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div><div style={{fontSize:15,fontWeight:700,color:'var(--text)',fontFamily:'DM Sans,sans-serif'}}>WhatsApp Provider</div><div style={{fontSize:12,color:'var(--m)',fontFamily:'DM Sans,sans-serif',marginTop:2}}>Choose how Thynk Registration sends WhatsApp messages to parents</div></div>
          <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:wa.enabled?'#15803d':'var(--m)'}}>{wa.enabled?'Enabled':'Disabled'}</span><div onClick={()=>set({enabled:!wa.enabled})} style={{width:44,height:24,borderRadius:12,background:wa.enabled?'#22C55E':'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}><div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:wa.enabled?23:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/></div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {provs.map(([id,meta])=>{const selected=wa.provider===id;return(<button key={id} onClick={()=>set({provider:id})} style={{padding:'16px 14px',borderRadius:12,border:`2px solid ${selected?meta.color:'var(--bd)'}`,background:selected?meta.colorBg:'var(--bg)',cursor:'pointer',textAlign:'left',transition:'all .15s',outline:'none'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}><div style={{width:36,height:36,borderRadius:10,background:meta.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{meta.icon}</div>{selected&&<div style={{width:16,height:16,borderRadius:'50%',background:meta.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff'}}>✓</div>}</div><div style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,color:'var(--text)',marginBottom:4}}>{meta.label}</div><div style={{display:'inline-block',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:100,background:meta.badgeBg,color:meta.badgeColor,marginBottom:6}}>{meta.badge}</div><div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',lineHeight:1.4}}>{meta.description}</div></button>);})}
        </div>
      </div>
      {/* Credentials */}
      <div style={{background:'var(--card)',borderRadius:16,border:`1.5px solid ${prov.colorBorder}`,padding:24}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:40,height:40,borderRadius:12,background:prov.iconBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{prov.icon}</div><div><div style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:15,color:'var(--text)'}}>{prov.label} Credentials</div><div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:isConfigured()?'#15803d':'var(--red)',marginTop:1}}>{isConfigured()?'✓ All credentials provided':'⚠ Missing required credentials'}</div></div></div>
          <a href={prov.docsUrl} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,border:`1.5px solid ${prov.colorBorder}`,background:prov.colorBg,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,color:prov.color,textDecoration:'none'}}>🔗 {wa.provider==='thynkcomm'?'Open ThynkComm':'View Docs'}</a>
        </div>
        {wa.provider==='thynkcomm'&&(<>
          <div style={{padding:'14px 16px',borderRadius:12,background:'rgba(26,184,168,0.07)',border:'1px solid rgba(26,184,168,0.2)',marginBottom:20}}>
            <div style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,color:'#1ab8a8',marginBottom:8}}>⚡ How to get your ThynkComm API Key</div>
            <ol style={{margin:0,paddingLeft:18,display:'flex',flexDirection:'column',gap:4}}>{['Open your ThynkComm dashboard (e.g. thynkcom.vercel.app)','Go to Integrations → Other Apps tab','Click "+ New Integration Key" → fill in name (e.g. "Thynk Registration")','Select permissions: Send Messages ✓','Click Generate Key — copy the API Key and Secret Key','Paste both below along with your ThynkComm URL'].map((s,i)=><li key={i} style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--text)',lineHeight:1.5}}>{s}</li>)}</ol>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div><label style={lbl}>ThynkComm URL *</label><input value={wa.tcUrl} onChange={e=>set({tcUrl:e.target.value})} placeholder="https://thynkcom.vercel.app" style={inp}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Your Vercel deployment URL — no trailing slash.</p></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div><label style={lbl}>API Key *</label><input value={wa.tcApiKey} onChange={e=>set({tcApiKey:e.target.value})} placeholder="tk_XXXXXXXXXXXXXXXX" style={{...inp,fontFamily:'monospace',fontSize:12}}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Starts with tk_ — from ThynkComm Integrations</p></div>
              <div><label style={lbl}>API Secret *</label><div style={{position:'relative'}}><input type={showSecret?'text':'password'} value={wa.tcApiSecret} onChange={e=>set({tcApiSecret:e.target.value})} placeholder="sk_live_xxxxxxxx" style={{...inp,paddingRight:40,fontFamily:'monospace',fontSize:12}}/><button type="button" onClick={()=>setShowSecret(!showSecret)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>{showSecret?'🙈':'👁️'}</button></div><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Starts with sk_live_ — shown once at creation</p></div>
            </div>
            <div style={{padding:'12px 14px',borderRadius:10,background:'var(--bg)',border:'1.5px solid var(--bd)'}}>
              <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,color:'var(--m)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.07em'}}>Request ThynkComm receives</div>
              <code style={{fontFamily:'monospace',fontSize:11,color:'var(--text)',lineHeight:1.8,display:'block'}}><span style={{color:'#1ab8a8'}}>POST</span> {wa.tcUrl||'https://thynkcom.vercel.app'}/api/send-message<br/>x-api-key: {wa.tcApiKey?wa.tcApiKey.slice(0,10)+'••••':'<api-key>'}<br/>x-api-secret: {wa.tcApiSecret?wa.tcApiSecret.slice(0,12)+'••••':'<secret>'}<br/>{'{ "to": "919876543210", "message": "..." }'}</code>
            </div>
          </div>
        </>)}
        {wa.provider==='meta'&&(<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Access Token *</label><div style={{position:'relative'}}><input type={showToken?'text':'password'} value={wa.metaToken} onChange={e=>set({metaToken:e.target.value})} placeholder="EAAxxxxxxxx…" style={{...inp,paddingRight:40,fontFamily:'monospace',fontSize:12}}/><button type="button" onClick={()=>setShowToken(!showToken)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>{showToken?'🙈':'👁️'}</button></div><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--red)',margin:'4px 0 0'}}>⚠ Use a permanent System User token — temporary tokens expire in 24 hours.</p></div>
          <div><label style={lbl}>Phone Number ID *</label><input value={wa.metaPhoneId} onChange={e=>set({metaPhoneId:e.target.value})} placeholder="1234567890" style={inp}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Meta → WhatsApp → API Setup → Phone Number ID</p></div>
        </div>)}
        {wa.provider==='twilio'&&(<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div><label style={lbl}>Account SID *</label><input value={wa.accountSid} onChange={e=>set({accountSid:e.target.value})} placeholder="ACxxxxxxxxxxxxxxxx" style={inp}/></div>
          <SecretField label="Auth Token *" hint="Twilio Console → Account Info" value={wa.authToken} onChange={v=>set({authToken:v})}/>
          <div style={{gridColumn:'1 / -1'}}><label style={lbl}>WhatsApp From Number *</label><input value={wa.fromNumber} onChange={e=>set({fromNumber:e.target.value})} placeholder="whatsapp:+14155238886" style={inp}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Include the whatsapp: prefix. Use your approved sender number.</p></div>
        </div>)}
      </div>
      {/* Test */}
      <div style={{background:'var(--card)',borderRadius:16,border:'1.5px solid var(--bd)',padding:24}}>
        <div style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,color:'var(--text)',marginBottom:4}}>📤 Send a Test Message</div>
        <div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginBottom:16}}>Verify the integration is working before going live</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:14,marginBottom:14}}>
          <div><label style={lbl}>Phone Number *</label><input value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="919876543210" style={inp}/><p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:testPhone&&normalisePhone(testPhone).length>=10?'#15803d':'var(--m)',margin:'4px 0 0'}}>{testPhone?`Will send to: ${normalisePhone(testPhone)||'⚠ invalid'}`:'Country code + number, no +. Indian 10-digit auto-prefixed.'}</p></div>
          <div><label style={lbl}>Message</label><input value={testMsg} onChange={e=>setTestMsg(e.target.value)} style={inp}/></div>
        </div>
        {testResult&&(<div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{padding:'12px 16px',borderRadius:10,background:testResult.ok?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)',border:`1px solid ${testResult.ok?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)'}`,display:'flex',gap:10}}><span style={{flexShrink:0}}>{testResult.ok?'✅':'❌'}</span><span style={{fontFamily:'monospace',fontSize:12,color:testResult.ok?'#15803d':'var(--red)',wordBreak:'break-all'}}>{testResult.msg}</span></div>
          {testResult.hint&&<div style={{padding:'10px 14px',borderRadius:8,background:'rgba(184,134,11,.07)',border:'1px solid rgba(184,134,11,.2)',fontFamily:'DM Sans,sans-serif',fontSize:12,color:'#92610A'}}>🔧 <strong>Fix:</strong> {testResult.hint}</div>}
          {testResult.warning&&<div style={{padding:'10px 14px',borderRadius:8,background:'var(--orange2)',border:'1px solid var(--orange)',fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--orange)'}}>⚠️ {testResult.warning}</div>}
          {testResult.raw&&<div><button onClick={()=>setShowRaw(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',padding:0}}>{showRaw?'▲ Hide':'▼ Show'} raw API response</button>{showRaw&&<pre style={{marginTop:6,padding:'10px 12px',background:'var(--bg)',border:'1.5px solid var(--bd)',borderRadius:8,fontFamily:'monospace',fontSize:11,overflow:'auto',maxHeight:160}}>{JSON.stringify(testResult.raw,null,2)}</pre>}</div>}
        </div>)}
        <button onClick={sendTest} disabled={testing||!isConfigured()} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 22px',borderRadius:9,background:isConfigured()?'#15803d':'var(--bd)',border:'none',color:isConfigured()?'#fff':'var(--m)',cursor:testing||!isConfigured()?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:testing?0.7:1}}>{testing?'⏳ Sending…':'📤 Send Test Message'}</button>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end'}}><button onClick={save} disabled={saving} style={{display:'flex',alignItems:'center',gap:8,padding:'11px 28px',borderRadius:10,background:'var(--acc)',border:'none',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:14,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:saving?0.7:1}}>{saving?'⏳ Saving…':'💾 Save WhatsApp Settings'}</button></div>
    </div>
  );
}

// ── Multi-SMTP Email Configuration ──────────────────────────────────────────

type EmailProvider = 'brevo' | 'gmail' | 'zoho' | 'outlook' | 'custom';

interface ProviderMeta {
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  smtpHost: string;
  smtpPort: string;
  passLabel: string;
  passHint: string;
  userHint: string;
  setupSteps: string[];
  docsUrl: string;
  extraFields?: Array<{ key: string; label: string; hint: string }>;
}

const EMAIL_PROVIDERS: Record<EmailProvider, ProviderMeta> = {
  brevo: {
    label: 'Brevo',
    icon: '🚀',
    color: '#0b996e',
    bg: 'rgba(11,153,110,.07)',
    border: 'rgba(11,153,110,.3)',
    smtpHost: 'smtp-relay.brevo.com',
    smtpPort: '587',
    passLabel: 'Brevo SMTP Key',
    passHint: 'xsmtpsib-…  (from Account → SMTP & API → API Keys)',
    userHint: 'abc123@smtp-brevo.com  (the "Login" value in SMTP tab)',
    setupSteps: [
      'Sign up free at brevo.com (300 emails/day, no credit card)',
      'Go to Account → SMTP & API → SMTP tab',
      'Click "Generate a new SMTP key" and copy it',
      'Also copy the "Login" value — it looks like abc123@smtp-brevo.com',
      'Paste Login → SMTP Username below, SMTP Key → SMTP Password',
      'For real-time stats (opens/bounces): copy your API key from Account → SMTP & API → API Keys tab',
      'Add & verify your sending domain under Senders & IPs → Domains',
    ],
    docsUrl: 'https://app.brevo.com/',
  },
  gmail: {
    label: 'Gmail',
    icon: '📬',
    color: '#EA4335',
    bg: 'rgba(234,67,53,.07)',
    border: 'rgba(234,67,53,.3)',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    passLabel: 'App Password',
    passHint: '16-char App Password (NOT your Google password)',
    userHint: 'your@gmail.com or your@workspace.com',
    setupSteps: [
      'Go to myaccount.google.com → Security',
      'Enable 2-Step Verification if not already on',
      'Search for "App Passwords" in the search bar',
      'Select "Mail" app and "Other" device → name it "Thynk Registration"',
      'Copy the 16-character password (spaces are OK — they\'re ignored)',
      'Paste your Gmail address as SMTP Username and the App Password below',
      'Note: Gmail limits ~500 emails/day — use Brevo for bulk sending',
    ],
    docsUrl: 'https://myaccount.google.com/apppasswords',
  },
  zoho: {
    label: 'Zoho Mail',
    icon: '🔷',
    color: '#E42527',
    bg: 'rgba(228,37,39,.07)',
    border: 'rgba(228,37,39,.3)',
    smtpHost: 'smtp.zoho.in',
    smtpPort: '587',
    passLabel: 'App-Specific Password',
    passHint: 'Generated in Zoho Account → Security → App Passwords',
    userHint: 'your@yourdomain.com (Zoho Mail address)',
    setupSteps: [
      'Log in to accounts.zoho.in → My Account',
      'Go to Security → App Passwords',
      'Click "Generate New Password" → name it "Thynk Registration"',
      'Copy the generated password',
      'Use your Zoho Mail address as SMTP Username',
      'Note: Use smtp.zoho.in for India, smtp.zoho.com for global',
      'Verify your sending domain in Zoho Mail Admin Console',
    ],
    docsUrl: 'https://accounts.zoho.in/security',
  },
  outlook: {
    label: 'Outlook / 365',
    icon: '🔵',
    color: '#0078D4',
    bg: 'rgba(0,120,212,.07)',
    border: 'rgba(0,120,212,.3)',
    smtpHost: 'smtp.office365.com',
    smtpPort: '587',
    passLabel: 'Password / App Password',
    passHint: 'Your Microsoft account password or App Password if MFA is on',
    userHint: 'your@outlook.com or your@company.onmicrosoft.com',
    setupSteps: [
      'For personal Outlook: use smtp-mail.outlook.com, port 587',
      'For Microsoft 365 / Office: use smtp.office365.com, port 587',
      'If Multi-Factor Auth is enabled, generate an App Password:',
      '  → account.microsoft.com → Security → Advanced security options → App passwords',
      'Enable SMTP AUTH for your mailbox in Microsoft 365 Admin Center:',
      '  → Exchange Admin → Mailboxes → select user → Mail Flow Settings → SMTP AUTH',
      'Use your full email address as SMTP Username',
    ],
    docsUrl: 'https://account.microsoft.com/security',
  },
  custom: {
    label: 'Custom SMTP',
    icon: '⚙️',
    color: '#6366f1',
    bg: 'rgba(99,102,241,.07)',
    border: 'rgba(99,102,241,.3)',
    smtpHost: '',
    smtpPort: '587',
    passLabel: 'SMTP Password',
    passHint: 'Your SMTP account password',
    userHint: 'SMTP username / email address',
    setupSteps: [
      'Enter the SMTP hostname provided by your email service',
      'Common ports: 587 (STARTTLS, recommended), 465 (SSL), 25 (plain — usually blocked)',
      'Use the login email address as SMTP Username',
      'Use the account password or App Password as SMTP Password',
      'Test the connection using the button below before saving',
      'Make sure your server allows SMTP AUTH connections',
    ],
    docsUrl: '',
    extraFields: [
      { key: 'smtpHost', label: 'SMTP Host', hint: 'e.g. mail.yourdomain.com' },
      { key: 'smtpPort', label: 'SMTP Port', hint: '587' },
    ],
  },
};

interface SmtpConfig {
  id:         string;
  name:       string;
  provider:   EmailProvider;
  program_id: string;
  fromName:   string;
  fromEmail:  string;
  smtpHost:   string;
  smtpPort:   string;
  smtpUser:   string;
  smtpPass:   string;
  enabled:    boolean;
  // Auth method: 'smtp' (default, username+password) or 'graph' (Microsoft Graph
  // API / OAuth — recommended for Office 365, since Microsoft disabled SMTP Basic
  // Auth on most tenants). Only relevant when provider === 'outlook'.
  authMethod?:   'smtp' | 'graph';
  tenantId?:     string;
  clientId?:     string;
  clientSecret?: string;
}

function newSmtp(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  const provider: EmailProvider = (overrides.provider as EmailProvider) || 'gmail';
  const meta = EMAIL_PROVIDERS[provider];
  return {
    id:         Math.random().toString(36).slice(2),
    name:       'New Email Account',
    provider,
    program_id: '',
    fromName:   'Thynk Registration',
    fromEmail:  '',
    smtpHost:   meta.smtpHost,
    smtpPort:   meta.smtpPort,
    smtpUser:   '',
    smtpPass:   '',
    enabled:    true,
    authMethod:   'smtp',
    tenantId:     '',
    clientId:     '',
    clientSecret: '',
    ...overrides,
  };
}

function SmtpCard({
  cfg, programs, index, total,
  onChange, onDelete, onTest, testing, testResult,
}: {
  cfg: SmtpConfig;
  programs: Row[];
  index: number;
  total: number;
  onChange: (patch: Partial<SmtpConfig>) => void;
  onDelete: () => void;
  onTest:   (to: string) => void;
  testing:  boolean;
  testResult: {ok:boolean;msg:string} | null;
}) {
  const [expanded,    setExpanded]    = useState(index === 0);
  const [showPass,    setShowPass]    = useState(false);
  const [showGuide,   setShowGuide]   = useState(false);
  const [testTo,      setTestTo]      = useState('');
  const isDefault = cfg.program_id === '';
  const prog = programs.find(p => p.id === cfg.program_id);
  const meta = EMAIL_PROVIDERS[cfg.provider as EmailProvider] || EMAIL_PROVIDERS.custom;
  const isConfigured = cfg.authMethod === 'graph'
    ? !!(cfg.tenantId && cfg.clientId && cfg.clientSecret && cfg.fromEmail)
    : !!(cfg.smtpUser && cfg.smtpPass);
  const PROVIDERS = Object.entries(EMAIL_PROVIDERS) as [EmailProvider, ProviderMeta][];

  const switchProvider = (p: EmailProvider) => {
    const m = EMAIL_PROVIDERS[p];
    onChange({ provider: p, smtpHost: m.smtpHost, smtpPort: m.smtpPort });
  };

  return (
    <div style={{background:'var(--card)',border:`1.5px solid ${cfg.enabled?meta.border:'var(--bd)'}`,borderRadius:16,overflow:'hidden',marginBottom:12}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',cursor:'pointer',background:cfg.enabled?meta.bg:'transparent',transition:'background .2s'}} onClick={()=>setExpanded(e=>!e)}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${meta.color},${meta.color}bb)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
          {meta.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:2}}>
            <span style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>{cfg.name || 'Unnamed Account'}</span>
            <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:meta.bg,color:meta.color,border:`1px solid ${meta.border}`}}>{meta.label}</span>
            {isDefault
              ? <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'rgba(16,185,129,.12)',color:'#15803d'}}>★ Default</span>
              : prog
                ? <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'rgba(99,102,241,.12)',color:'var(--acc)'}}>{prog.name}</span>
                : <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'rgba(245,158,11,.12)',color:'#b45309'}}>⚠ No program</span>
            }
            {isConfigured
              ? <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(16,185,129,.08)',color:'#15803d'}}>✓ Configured</span>
              : <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(239,68,68,.08)',color:'#dc2626'}}>⚠ Not configured</span>
            }
          </div>
          <div style={{fontSize:11,color:'var(--m)'}}>{cfg.smtpUser || '—'} · from {cfg.fromEmail || cfg.smtpUser || 'no from address'}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>onChange({enabled:!cfg.enabled})}
            style={{width:40,height:22,borderRadius:11,background:cfg.enabled?meta.color:'var(--bd)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
            <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:cfg.enabled?21:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
          </div>
          {total > 1 && (
            <button onClick={onDelete}
              style={{padding:'5px 10px',borderRadius:7,border:'1.5px solid rgba(239,68,68,.3)',background:'rgba(239,68,68,.07)',color:'#dc2626',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              🗑
            </button>
          )}
          <span style={{color:'var(--m)',fontSize:14,transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}}>▼</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{padding:'20px',borderTop:`1px solid var(--bd)`}}>

          {/* Provider selector */}
          <div style={{marginBottom:20}}>
            <label style={{...lbl,marginBottom:10}}>Email Provider</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PROVIDERS.map(([pid, pm]) => {
                const sel = cfg.provider === pid;
                return (
                  <button key={pid} onClick={()=>switchProvider(pid)}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'8px 16px',borderRadius:10,border:`2px solid ${sel?pm.color:'var(--bd)'}`,background:sel?pm.bg:'var(--bg)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,color:sel?pm.color:'var(--m)',transition:'all .15s',outline:'none'}}>
                    <span style={{fontSize:15}}>{pm.icon}</span> {pm.label}
                    {sel && <span style={{fontSize:10}}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setup guide collapsible */}
          <div style={{marginBottom:18,borderRadius:12,border:`1.5px solid ${meta.border}`,background:meta.bg,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',cursor:'pointer'}} onClick={()=>setShowGuide(g=>!g)}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:16}}>{meta.icon}</span>
                <span style={{fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,color:meta.color}}>{meta.label} setup guide</span>
                <span style={{fontSize:10,color:meta.color,opacity:0.7}}>({meta.setupSteps.length} steps · ~2 min)</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {meta.docsUrl && (
                  <a href={meta.docsUrl} target="_blank" rel="noreferrer"
                    onClick={e=>e.stopPropagation()}
                    style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:meta.color,textDecoration:'none',fontWeight:600}}>
                    Open dashboard ↗
                  </a>
                )}
                <span style={{color:meta.color,fontSize:12,transform:showGuide?'rotate(180deg)':'none',transition:'transform .2s'}}>▼</span>
              </div>
            </div>
            {showGuide && (
              <div style={{padding:'0 16px 14px',borderTop:`1px solid ${meta.border}`}}>
                <ol style={{margin:'10px 0 0',paddingLeft:18,display:'flex',flexDirection:'column',gap:5}}>
                  {meta.setupSteps.map((step, i) => (
                    <li key={i} style={{fontFamily:'DM Sans,sans-serif',fontSize:12,color:'var(--text)',lineHeight:1.6}}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div>
              <label style={lbl}>Display Name *</label>
              <input value={cfg.name} onChange={e=>onChange({name:e.target.value})} placeholder="e.g. Brevo Marketing" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Assigned Program</label>
              <select value={cfg.program_id} onChange={e=>onChange({program_id:e.target.value})}
                style={{...inp,cursor:'pointer',appearance:'none' as any}}>
                <option value="">★ Default (fallback for all programs)</option>
                {programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>
                {isDefault?'Used as fallback when no program-specific SMTP is set.':'Emails for this program will use this account.'}
              </p>
            </div>
            <div>
              <label style={lbl}>Sender Name</label>
              <input value={cfg.fromName} onChange={e=>onChange({fromName:e.target.value})} placeholder="Thynk Registration" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Your "From" Email Address</label>
              <input value={cfg.fromEmail} onChange={e=>onChange({fromEmail:e.target.value})} placeholder="hello@yourdomain.com" style={inp}/>
              <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>Must be a verified sender on {meta.label}</p>
            </div>

            {/* Custom SMTP host/port */}
            {cfg.provider === 'custom' && (<>
              <div>
                <label style={lbl}>SMTP Host *</label>
                <input value={cfg.smtpHost} onChange={e=>onChange({smtpHost:e.target.value})} placeholder="mail.yourdomain.com" style={inp}/>
              </div>
              <div>
                <label style={lbl}>SMTP Port</label>
                <input value={cfg.smtpPort} onChange={e=>onChange({smtpPort:e.target.value})} placeholder="587" style={inp}/>
                <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>587 (STARTTLS) or 465 (SSL)</p>
              </div>
            </>)}

            {/* Outlook variant selector */}
            {cfg.provider === 'outlook' && (
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Server Type</label>
                <div style={{display:'flex',gap:8}}>
                  {[
                    {label:'Microsoft 365 / Office',host:'smtp.office365.com'},
                    {label:'Personal Outlook.com',  host:'smtp-mail.outlook.com'},
                  ].map(opt=>(
                    <button key={opt.host} onClick={()=>onChange({smtpHost:opt.host})}
                      style={{flex:1,padding:'9px 14px',borderRadius:9,border:`1.5px solid ${cfg.smtpHost===opt.host?meta.color:'var(--bd)'}`,background:cfg.smtpHost===opt.host?meta.bg:'var(--bg)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:cfg.smtpHost===opt.host?meta.color:'var(--m)',textAlign:'left' as const}}>
                      {opt.label}
                      <div style={{fontSize:10,opacity:0.7,marginTop:2}}>{opt.host}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Outlook auth method: SMTP vs Microsoft Graph */}
            {cfg.provider === 'outlook' && (
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Authentication Method</label>
                <div style={{display:'flex',gap:8,marginBottom:8}}>
                  <button onClick={()=>onChange({authMethod:'smtp'})}
                    style={{flex:1,padding:'9px 14px',borderRadius:9,border:`1.5px solid ${(cfg.authMethod??'smtp')==='smtp'?meta.color:'var(--bd)'}`,background:(cfg.authMethod??'smtp')==='smtp'?meta.bg:'var(--bg)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:(cfg.authMethod??'smtp')==='smtp'?meta.color:'var(--m)',textAlign:'left' as const}}>
                    Password (SMTP)
                    <div style={{fontSize:10,opacity:0.7,marginTop:2}}>Often blocked by Microsoft — see note below</div>
                  </button>
                  <button onClick={()=>onChange({authMethod:'graph'})}
                    style={{flex:1,padding:'9px 14px',borderRadius:9,border:`1.5px solid ${cfg.authMethod==='graph'?meta.color:'var(--bd)'}`,background:cfg.authMethod==='graph'?meta.bg:'var(--bg)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:cfg.authMethod==='graph'?meta.color:'var(--m)',textAlign:'left' as const}}>
                    Microsoft Graph API (Recommended)
                    <div style={{fontSize:10,opacity:0.7,marginTop:2}}>OAuth — works even if SMTP is disabled</div>
                  </button>
                </div>
                {(cfg.authMethod??'smtp') === 'smtp' && (
                  <p style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'#b45309',background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',borderRadius:8,padding:'8px 10px',margin:0}}>
                    ⚠ Microsoft has disabled SMTP Basic Auth (username/password) on most 365 tenants. If testing fails
                    here even though the same account works fine in the Outlook desktop app — that's this restriction,
                    not a wrong password. Switch to <b>Microsoft Graph API</b> above to fix it permanently.
                  </p>
                )}
                {cfg.authMethod === 'graph' && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:6}}>
                    <div style={{gridColumn:'1/-1'}}>
                      <p style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',margin:'0 0 8px'}}>
                        Requires a one-time Azure AD App Registration (Azure Portal → Azure Active Directory → App
                        registrations → New registration → grant it the <b>Mail.Send</b> Application permission →
                        <b> Grant admin consent</b>). Paste the three values from that app below.
                      </p>
                    </div>
                    <div>
                      <label style={lbl}>Tenant ID *</label>
                      <input value={cfg.tenantId ?? ''} onChange={e=>onChange({tenantId:e.target.value})} placeholder="Directory (tenant) ID" style={inp}/>
                    </div>
                    <div>
                      <label style={lbl}>Client ID *</label>
                      <input value={cfg.clientId ?? ''} onChange={e=>onChange({clientId:e.target.value})} placeholder="Application (client) ID" style={inp}/>
                    </div>
                    <div style={{gridColumn:'1/-1'}}>
                      <label style={lbl}>Client Secret *</label>
                      <div style={{position:'relative'}}>
                        <input type={showPass?'text':'password'} value={cfg.clientSecret ?? ''} onChange={e=>onChange({clientSecret:e.target.value})} placeholder="Client secret VALUE (not the secret ID)" style={{...inp,paddingRight:40,fontFamily:showPass?'monospace':'DM Sans,sans-serif'}}/>
                        <button type="button" onClick={()=>setShowPass(s=>!s)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>{showPass?'🙈':'👁️'}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* Zoho region selector */}
            {cfg.provider === 'zoho' && (
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Server Region</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {[
                    {label:'India (zoho.in)',   host:'smtp.zoho.in'},
                    {label:'Global (zoho.com)',  host:'smtp.zoho.com'},
                    {label:'Europe (zoho.eu)',   host:'smtp.zoho.eu'},
                  ].map(opt=>(
                    <button key={opt.host} onClick={()=>onChange({smtpHost:opt.host})}
                      style={{flex:1,padding:'9px 14px',borderRadius:9,border:`1.5px solid ${cfg.smtpHost===opt.host?meta.color:'var(--bd)'}`,background:cfg.smtpHost===opt.host?meta.bg:'var(--bg)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:cfg.smtpHost===opt.host?meta.color:'var(--m)',textAlign:'left' as const}}>
                      {opt.label}
                      <div style={{fontSize:10,opacity:0.7,marginTop:2}}>{opt.host}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SMTP Username */}
            {!(cfg.provider === 'outlook' && cfg.authMethod === 'graph') && (
            <div>
              <label style={lbl}>{cfg.provider === 'brevo' ? 'Brevo SMTP Login' : 'SMTP Username'}</label>
              <input value={cfg.smtpUser} onChange={e=>onChange({smtpUser:e.target.value})} placeholder={meta.userHint} style={inp}/>
              <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{meta.userHint}</p>
            </div>
            )}

            {/* Password */}
            {!(cfg.provider === 'outlook' && cfg.authMethod === 'graph') && (
            <div>
              <label style={lbl}>{meta.passLabel}</label>
              <div style={{position:'relative'}}>
                <input type={showPass?'text':'password'} value={cfg.smtpPass} onChange={e=>onChange({smtpPass:e.target.value})} placeholder={meta.passHint} style={{...inp,paddingRight:40,fontFamily:showPass?'monospace':'DM Sans,sans-serif'}}/>
                <button type="button" onClick={()=>setShowPass(s=>!s)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--m)',fontSize:14}}>{showPass?'🙈':'👁️'}</button>
              </div>
              <p style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'var(--m)',margin:'4px 0 0'}}>{meta.passHint}</p>
            </div>
            )}
          </div>

          {/* Server details read-only for preset providers */}
          {cfg.provider !== 'custom' && !(cfg.provider === 'outlook' && cfg.authMethod === 'graph') && (
            <div style={{marginTop:14,padding:'10px 14px',background:'var(--bg)',borderRadius:9,border:'1.5px solid var(--bd)',display:'flex',gap:20,flexWrap:'wrap'}}>
              <div style={{fontFamily:'monospace',fontSize:11,color:'var(--m)'}}>Host: <span style={{color:'var(--text)',fontWeight:600}}>{cfg.smtpHost}</span></div>
              <div style={{fontFamily:'monospace',fontSize:11,color:'var(--m)'}}>Port: <span style={{color:'var(--text)',fontWeight:600}}>{cfg.smtpPort}</span></div>
              <div style={{fontFamily:'monospace',fontSize:11,color:'var(--m)'}}>Encryption: <span style={{color:'var(--text)',fontWeight:600}}>STARTTLS</span></div>
            </div>
          )}

          {/* Test */}
          <div style={{marginTop:16,padding:'16px',background:'var(--bg)',borderRadius:12,border:'1.5px solid var(--bd)'}}>
            <div style={{fontWeight:700,fontSize:13,color:'var(--text)',marginBottom:12}}>📤 Send Test Email</div>
            <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:180}}>
                <label style={lbl}>Send test to</label>
                <input value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="your@email.com" style={inp}/>
              </div>
              <button onClick={()=>onTest(testTo)} disabled={testing||!testTo.trim()||!isConfigured}
                style={{padding:'10px 20px',borderRadius:9,border:`1.5px solid ${meta.color}`,background:'transparent',color:meta.color,cursor:(testing||!testTo||!isConfigured)?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:(testing||!testTo||!isConfigured)?0.5:1,whiteSpace:'nowrap'}}>
                {testing?'⏳ Sending…':'🔌 Test Connection'}
              </button>
            </div>
            {!isConfigured && <p style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',margin:'8px 0 0'}}>⚠ Enter credentials above to enable testing</p>}
            {testResult && (
              <div style={{marginTop:10,padding:'10px 14px',borderRadius:8,background:testResult.ok?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)',border:`1px solid ${testResult.ok?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)'}`,fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600,color:testResult.ok?'#15803d':'var(--red)'}}>
                {testResult.ok?'✅':'❌'} {testResult.msg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function detectProvider(host: string): EmailProvider {
  const h = host.toLowerCase();
  if (h.includes('brevo') || h.includes('sendinblue')) return 'brevo';
  if (h.includes('gmail') || h.includes('google'))     return 'gmail';
  if (h.includes('zoho'))                              return 'zoho';
  if (h.includes('outlook') || h.includes('office365') || h.includes('microsoft')) return 'outlook';
  if (h === '')                                        return 'gmail'; // new/empty default
  return 'custom';
}

function EmailTab({showToast}:{showToast:(m:string)=>void}) {
  const [configs,  setConfigs]  = useState<SmtpConfig[]>([newSmtp({name:'Default Email Account', provider:'gmail'})]);
  const [programs, setPrograms] = useState<Row[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [testingId,setTestingId]= useState<string|null>(null);
  const [testResults, setTestResults] = useState<Record<string,(({ok:boolean;msg:string})|null)>>({});

  // Load programs and saved configs
  useEffect(()=>{
    authFetch(`${BACKEND}/api/admin/projects`).then(r=>r.ok?r.json():null).then(d=>setPrograms(d?.projects??[])).catch(()=>{});
    authFetch(`${BACKEND}/api/admin/settings`).then(r=>r.ok?r.json():null).then(d=>{
      const saved:SmtpConfig[] = d?.email_smtp_configs;
      if (saved?.length) {
        setConfigs(saved.map(c=>({...newSmtp(), ...c, id: c.id || Math.random().toString(36).slice(2), provider: c.provider || detectProvider(c.smtpHost||'')})));
      } else if (d?.email_settings) {
        // Migrate legacy single SMTP config
        const legacy = d.email_settings;
        setConfigs([newSmtp({
          name: 'Default Email Account',
          provider: detectProvider(legacy.smtpHost || ''),
          program_id: '',
          fromName:  legacy.fromName  || 'Thynk Registration',
          fromEmail: legacy.fromEmail || '',
          smtpHost:  legacy.smtpHost  || 'smtp.gmail.com',
          smtpPort:  legacy.smtpPort  || '587',
          smtpUser:  legacy.smtpUser  || '',
          smtpPass:  legacy.smtpPass  || '',
          enabled:   legacy.enabled   ?? true,
        })]);
      }
    }).catch(()=>{});
  },[]);

  const update = (id:string, patch:Partial<SmtpConfig>) =>
    setConfigs(p=>p.map(c=>c.id===id?{...c,...patch}:c));

  const add = () => {
    const usedPrograms = configs.map(c=>c.program_id).filter(Boolean);
    const nextProg = programs.find(p=>!usedPrograms.includes(p.id));
    setConfigs(p=>[...p, newSmtp({
      name: nextProg ? `${nextProg.name} Email` : `Email Account ${p.length+1}`,
      provider: 'gmail',
      program_id: nextProg?.id ?? '',
    })]);
  };

  const remove = (id:string) => setConfigs(p=>p.filter(c=>c.id!==id));

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/api/admin/settings`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email_smtp_configs: configs }),
      });
      if (res.ok) showToast('✅ Email SMTP configurations saved!');
      else        showToast('❌ Save failed');
    } catch { showToast('❌ Save failed'); }
    setSaving(false);
  };

  const testSmtp = async (cfg: SmtpConfig, to: string) => {
    if (!to.trim()) { showToast('❌ Enter a test recipient'); return; }
    const isGraph = cfg.provider === 'outlook' && cfg.authMethod === 'graph';
    if (isGraph) {
      if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.fromEmail) { showToast('❌ Fill Tenant ID, Client ID, Client Secret and From Email first'); return; }
    } else if (!cfg.smtpUser || !cfg.smtpPass) {
      showToast('❌ Fill SMTP credentials first'); return;
    }
    setTestingId(cfg.id);
    setTestResults(p=>({...p,[cfg.id]:null}));
    try {
      const res = await authFetch(`${BACKEND}/api/admin/settings/test`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(isGraph
          ? { to, authMethod:'graph', tenantId:cfg.tenantId, clientId:cfg.clientId, clientSecret:cfg.clientSecret, fromName:cfg.fromName, fromEmail:cfg.fromEmail }
          : { to, smtpHost:cfg.smtpHost, smtpPort:cfg.smtpPort, smtpUser:cfg.smtpUser, smtpPass:cfg.smtpPass, fromName:cfg.fromName, fromEmail:cfg.fromEmail }),
      });
      const d = await res.json();
      const result = {ok:!!d.success, msg: d.message||d.error||'Unknown'};
      setTestResults(p=>({...p,[cfg.id]:result}));
      showToast(d.success?'✅ Test email sent!':'❌ Email test failed');
    } catch(e:any) {
      setTestResults(p=>({...p,[cfg.id]:{ok:false,msg:e.message}}));
    }
    setTestingId(null);
  };

  // Validation: warn if no default SMTP
  const hasDefault = configs.some(c=>c.program_id===''&&c.enabled);
  const programsWithoutSmtp = programs.filter(p=>!configs.some(c=>c.program_id===p.id&&c.enabled));

  return (
    <div>
      {/* Info banner */}
      <div style={{background:'rgba(79,70,229,.06)',border:'1.5px solid rgba(79,70,229,.2)',borderRadius:12,padding:'14px 18px',marginBottom:20,fontFamily:'DM Sans,sans-serif'}}>
        <div style={{fontWeight:700,fontSize:13,color:'var(--acc)',marginBottom:6}}>📧 Multi-SMTP Routing</div>
        <div style={{fontSize:12,color:'var(--m)',lineHeight:1.6}}>
          Each program can have its own dedicated SMTP sender. If a program has no SMTP assigned, the <strong>Default SMTP</strong> is used as fallback.
          <br/>Example: Mental Math 2026 → <code style={{background:'var(--bd)',padding:'1px 5px',borderRadius:4}}>mentalmath@yourdomain.com</code> · Chess Program → <code style={{background:'var(--bd)',padding:'1px 5px',borderRadius:4}}>chess@yourdomain.com</code>
        </div>
      </div>

      {/* Warnings */}
      {!hasDefault && (
        <div style={{background:'rgba(239,68,68,.07)',border:'1.5px solid rgba(239,68,68,.25)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,fontWeight:600,color:'#dc2626',fontFamily:'DM Sans,sans-serif'}}>
          ⚠️ No Default SMTP configured. Emails for programs without a dedicated SMTP will fail. Set one config to "Default".
        </div>
      )}
      {programsWithoutSmtp.length > 0 && (
        <div style={{background:'rgba(245,158,11,.07)',border:'1.5px solid rgba(245,158,11,.25)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,fontWeight:600,color:'#b45309',fontFamily:'DM Sans,sans-serif'}}>
          📋 Programs using Default SMTP: {programsWithoutSmtp.map(p=>p.name).join(', ')}
        </div>
      )}

      {/* SMTP cards */}
      {configs.map((cfg,i)=>(
        <SmtpCard
          key={cfg.id}
          cfg={cfg}
          programs={programs}
          index={i}
          total={configs.length}
          onChange={patch=>update(cfg.id,patch)}
          onDelete={()=>remove(cfg.id)}
          onTest={to=>testSmtp(cfg,to)}
          testing={testingId===cfg.id}
          testResult={testResults[cfg.id]??null}
        />
      ))}

      {/* Add + Save */}
      <div style={{display:'flex',gap:10,marginTop:16,alignItems:'center'}}>
        <button onClick={add}
          style={{display:'flex',alignItems:'center',gap:7,padding:'10px 20px',borderRadius:9,border:'1.5px solid var(--acc)',background:'transparent',color:'var(--acc)',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>
          + Add Email Account
        </button>
        <button onClick={save} disabled={saving}
          style={{display:'flex',alignItems:'center',gap:7,padding:'10px 24px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:saving?0.7:1}}>
          {saving?'⏳ Saving…':'💾 Save All SMTP Configs'}
        </button>
        <span style={{fontSize:11,color:'var(--m)',fontFamily:'DM Sans,sans-serif'}}>{configs.length} SMTP config{configs.length!==1?'s':''}</span>
      </div>
    </div>
  );
}


export default function IntegrationsPage() {
  const {toast,show:showToast}=useToast();
  const [tab,setTab]=useState<'payments'|'email'|'whatsapp'>('payments');
  const [gateways,setGateways]=useState<GatewayState[]>([]);
  const [loadingGW,setLoadingGW]=useState(true);
  const [saving,setSaving]=useState(false);
  const dragIdx=useRef<number|null>(null);
  const dragOverIdx=useRef<number|null>(null);
  const [dragActive,setDragActive]=useState<number|null>(null);

  const loadGateways=useCallback(async()=>{
    try{
      // Load global configs (school_id=null) — no school filter needed
      const r=await authFetch(`${BACKEND}/api/admin/integrations`);
      const d=await r.json();
      const rows:Row[]=d.integrations??[];
      // Only use rows where school_id is null (global) or all rows if super_admin
      const globalRows=rows.filter((r:Row)=>r.school_id===null||r.school_id===undefined);
      const sourceRows=globalRows.length>0?globalRows:rows;
      const gwList:GatewayState[]=Object.keys(GATEWAY_META).map((id,i)=>{
        const row=sourceRows.find((r:Row)=>r.provider===id);
        return{id,enabled:row?.is_active??false,priority:row?.config?.priority??(i+1),key_id:row?.config?.key_id??'',key_secret:row?.config?.key_secret??'',mode:row?.config?.mode??'live',pg_label:row?.config?.pg_label??'',db_id:row?.id};
      });
      gwList.sort((a,b)=>a.priority-b.priority);
      setGateways(gwList);
    }catch{}
    setLoadingGW(false);
  },[]);
  useEffect(()=>{loadGateways();},[loadGateways]);

  const updateGateway=(id:string,patch:Partial<GatewayState>)=>setGateways(p=>p.map(g=>g.id===id?{...g,...patch}:g));
  const moveGateway=(idx:number,dir:-1|1)=>{setGateways(p=>{const arr=[...p],s=idx+dir;if(s<0||s>=arr.length)return arr;[arr[idx],arr[s]]=[arr[s],arr[idx]];return arr.map((g,i)=>({...g,priority:i+1}));});};
  const onDragStart=(idx:number)=>{dragIdx.current=idx;setDragActive(idx);};
  const onDragOver=(e:React.DragEvent,idx:number)=>{e.preventDefault();dragOverIdx.current=idx;};
  const onDrop=()=>{const from=dragIdx.current,to=dragOverIdx.current;if(from!==null&&to!==null&&from!==to){setGateways(p=>{const arr=[...p];const[moved]=arr.splice(from,1);arr.splice(to,0,moved);return arr.map((g,i)=>({...g,priority:i+1}));});}dragIdx.current=null;dragOverIdx.current=null;setDragActive(null);};

  const saveGateways=async()=>{
    setSaving(true);
    try{
      await Promise.all(gateways.map(gw=>authFetch(`${BACKEND}/api/admin/integrations`,{
        method:gw.db_id?'PATCH':'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          ...(gw.db_id?{id:gw.db_id}:{}),
          school_id: null,        // global config — applies to all schools
          provider:  gw.id,
          is_active: gw.enabled,
          priority:  gw.priority,
          config:{key_id:gw.key_id,key_secret:gw.key_secret,mode:gw.mode,priority:gw.priority,pg_label:gw.pg_label??''},
        }),
      })));
      showToast('✅ Payment gateways saved!');
      loadGateways();
    }catch{showToast('❌ Save failed');}
    setSaving(false);
  };

  const enabledCount=gateways.filter(g=>g.enabled&&g.key_id).length;
  const TABS=[{k:'payments' as const,icon:'💳',label:'Payment Gateways',badge:enabledCount>0?String(enabledCount):null},{k:'email' as const,icon:'📧',label:'Email / SMTP',badge:null},{k:'whatsapp' as const,icon:'💬',label:'WhatsApp',badge:null}];

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>
      {toast&&<div style={{position:'fixed',top:16,right:16,background:'#1e293b',color:'#fff',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>{toast}</div>}
      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{marginBottom:28}}><h1 style={{fontFamily:'Sora,sans-serif',fontSize:26,fontWeight:800,color:'var(--text)',margin:'0 0 4px'}}>Integrations <span style={{color:'var(--acc)'}}>Setup</span></h1><p style={{fontSize:13,color:'var(--m)',margin:0}}>Payment gateways, email & WhatsApp — configure all external services</p></div>
        <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
          {TABS.map(t=>(<button key={t.k} onClick={()=>setTab(t.k)} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,border:`1.5px solid ${tab===t.k?'var(--acc)':'var(--bd)'}`,background:tab===t.k?'var(--acc3)':'var(--card)',color:tab===t.k?'var(--acc)':'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer'}}>{t.icon} {t.label}{t.badge&&<span style={{padding:'1px 7px',borderRadius:100,background:'var(--acc)',color:'#fff',fontSize:10,fontWeight:700}}>{t.badge}</span>}</button>))}
        </div>
        {tab==='payments'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,padding:'12px 16px',background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12}}>
              <span style={{fontSize:16}}>💳</span>
              <div style={{flex:1}}><div style={{fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:700,color:'var(--text)'}}>{enabledCount===0?'No gateways active — students cannot make payments':`${enabledCount} gateway${enabledCount>1?'s':''} active`}</div><div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',marginTop:2}}>Drag ⠿ or use ▲▼ to reorder. Priority 1 = shown first at checkout.</div></div>
              <button onClick={saveGateways} disabled={saving} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 22px',borderRadius:9,background:'var(--acc)',border:'none',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,fontFamily:'DM Sans,sans-serif',opacity:saving?0.6:1}}>{saving?'⏳ Saving…':'💾 Save Order & Config'}</button>
            </div>
            {loadingGW?<div style={{textAlign:'center',padding:40,color:'var(--m)'}}>Loading gateway configuration…</div>:(
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {gateways.map((gw,i)=>(<div key={gw.id} draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)} onDrop={onDrop} onDragEnd={()=>{dragIdx.current=null;setDragActive(null);}} style={{opacity:dragActive===i?0.45:1,transition:'opacity .15s',outline:dragOverIdx.current===i&&dragActive!==i?'2px dashed var(--acc)':'none',borderRadius:14}}><GatewayCard gw={gw} onUpdate={updateGateway} onMoveUp={()=>moveGateway(i,-1)} onMoveDown={()=>moveGateway(i,1)} isFirst={i===0} isLast={i===gateways.length-1}/></div>))}
              </div>
            )}
            {enabledCount>1&&(<div style={{marginTop:20,padding:'16px 20px',background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:12}}><div style={{fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',color:'var(--m)',marginBottom:12}}>Checkout preview — students see gateways in this order</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{gateways.filter(g=>g.enabled&&g.key_id).map((gw,i)=>{const m=GATEWAY_META[gw.id];return(<div key={gw.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:9,border:`1.5px solid ${m.color}30`,background:m.bg}}><span style={{fontFamily:'DM Sans,sans-serif',fontSize:11,color:'var(--m)',fontWeight:700}}>{i+1}</span><span style={{fontSize:16}}>{m.logo}</span><span style={{fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,color:'var(--text)'}}>{m.name}</span><span style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:gw.mode==='live'?'var(--red)':'var(--m)',fontWeight:600}}>{gw.mode}</span></div>);})}</div></div>)}
          </div>
        )}
        {tab==='email'&&<EmailTab showToast={showToast}/>}
        {tab==='whatsapp'&&<WhatsAppTab showToast={showToast}/>}
        <div style={{marginTop:24}}><a href="/admin" style={{fontFamily:'DM Sans,sans-serif',fontSize:13,color:'var(--acc)',textDecoration:'none',fontWeight:600}}>← Back to Admin Dashboard</a></div>
      </div>
    </div>
  );
}
