'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { COLORS, IS, fmt, fmtR, StatCard, Badge, BarChart, DonutChart } from '@/components/consultant/ui';
import { CreateSchoolModal } from '@/components/consultant/CreateSchoolModal';
import { CuratedLinksModal } from '@/components/consultant/CuratedLinksModal';

const BACKEND  = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const BASE_URL = 'https://thynksuccess.com';
type Row = Record<string,any>;

export default function ConsultantDashboard() {
  const router = useRouter();
  const [user,         setUser]         = useState<any>(null);
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<'overview'|'schools'|'students'|'analytics'>('overview');
  const [showCreate,   setShowCreate]   = useState(false);
  const [showLinks,    setShowLinks]    = useState(false);
  const [toast,        setToast]        = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'paid'|'pending'>('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const toastRef = useRef<any>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data:d }) => {
      if (!d.user) { router.push('/consultant/login'); return; }
      setUser(d.user);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BACKEND}/api/consultant`);
      if (res.status===401||res.status===403) { router.push('/consultant/login'); return; }
      setData(await res.json());
    } catch(e:any) { showToast('Failed to load: '+e.message); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (user) load(); }, [user, load]);

  function showToast(msg:string) {
    setToast(msg); clearTimeout(toastRef.current);
    toastRef.current = setTimeout(()=>setToast(''), 3500);
  }

  async function doLogout() {
    await createClient().auth.signOut();
    router.push('/consultant/login');
  }

  const schools        = data?.schools        ?? [];
  const stats          = data?.stats;
  const allRows        = data?.rows           ?? [];
  const bySchool       = data?.bySchool       ?? {};
  const consultantCode = data?.consultantCode ?? '';

  const filteredRows = allRows.filter((r:Row) => {
    if (schoolFilter!=='all' && r.school_id!==schoolFilter) return false;
    if (statusFilter==='paid'    && r.payment_status!=='paid') return false;
    if (statusFilter==='pending' && !['pending','initiated'].includes(r.payment_status??'')) return false;
    if (search.trim()) {
      const q=search.toLowerCase();
      if (![r.student_name,r.school_name,r.contact_phone,r.contact_email,r.class_grade]
           .some(v=>v?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  function exportCSV() {
    const cols=['Date','Student','Grade','Gender','School','Phone','Email','Status','Amount','Paid At'];
    const rows=filteredRows.map((r:Row)=>[
      r.created_at?.slice(0,10),r.student_name,r.class_grade,r.gender,
      r.school_name,r.contact_phone,r.contact_email,
      r.payment_status,r.final_amount?fmtR(r.final_amount):'',
      r.paid_at?new Date(r.paid_at).toLocaleDateString('en-IN'):'',
    ].map(v=>JSON.stringify(v??'')).join(','));
    const csv=[cols.join(','),...rows].join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='students-report.csv'; a.click();
  }

  // Analytics
  const gradeMap:Record<string,number>={}, genderMap:Record<string,number>={}, trendMap:Record<string,number>={};
  for (const r of allRows) {
    if (r.class_grade) gradeMap[r.class_grade]=(gradeMap[r.class_grade]??0)+1;
    if (r.gender)      genderMap[r.gender]    =(genderMap[r.gender]    ??0)+1;
    const m=r.created_at?.slice(0,7); if(m) trendMap[m]=(trendMap[m]??0)+1;
  }
  const gradeData =(Object.entries(gradeMap).sort((a,b)=>a[0].localeCompare(b[0]))) as [string,number][];
  const genderData=(Object.entries(genderMap)) as [string,number][];
  const trendData =(Object.entries(trendMap).sort().slice(-6)) as [string,number][];
  const gc:Record<string,string>={Male:COLORS.indigo,Female:'#ec4899',Other:COLORS.amber};

  if (!user||loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'DM Sans,sans-serif',flexDirection:'column',gap:12,color:'var(--m)'}}>
      <div style={{width:44,height:44,border:'3px solid rgba(79,70,229,.2)',borderTopColor:'#4f46e5',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>Loading…
    </div>
  );

  const TABS=[{key:'overview',label:'📊 Overview'},{key:'schools',label:'🏫 Schools'},{key:'students',label:'👥 Students'},{key:'analytics',label:'📈 Analytics'}] as const;

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',fontFamily:'DM Sans,sans-serif'}}>

      {/* Header */}
      <div style={{borderBottom:'1.5px solid var(--bd)',padding:'0 28px',background:'var(--card)',position:'sticky',top:0,zIndex:100,height:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:'#fff',fontWeight:800,fontFamily:'Sora,sans-serif'}}>T</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:'var(--text)',fontFamily:'Sora,sans-serif'}}>Consultant Portal</div>
            <div style={{fontSize:11,color:'var(--m)'}}>{user?.email}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {consultantCode&&<button onClick={()=>setShowLinks(true)} style={{background:'rgba(79,70,229,.08)',border:'1.5px solid rgba(79,70,229,.25)',color:'#4f46e5',borderRadius:10,padding:'7px 14px',fontSize:13,fontWeight:700,cursor:'pointer'}}>🔗 Reg Links</button>}
          <button onClick={()=>setShowCreate(true)} style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',border:'none',borderRadius:10,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}}>+ New School</button>
          <button onClick={load} style={{background:'var(--bg)',border:'1.5px solid var(--bd)',color:'var(--m)',borderRadius:10,padding:'8px 12px',fontSize:13,cursor:'pointer'}}>🔄</button>
          <button onClick={doLogout} style={{background:'rgba(239,68,68,.08)',border:'1.5px solid rgba(239,68,68,.2)',color:'#ef4444',borderRadius:10,padding:'8px 14px',fontSize:13,fontWeight:600,cursor:'pointer'}}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:'var(--card)',borderBottom:'1.5px solid var(--bd)',padding:'0 28px',display:'flex'}}>
        {TABS.map(t=><button key={t.key} onClick={()=>setTab(t.key)} style={{background:'none',border:'none',borderBottom:tab===t.key?'2.5px solid #4f46e5':'2.5px solid transparent',color:tab===t.key?'#4f46e5':'var(--m)',padding:'14px 18px',fontSize:13,fontWeight:tab===t.key?700:500,cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:-1}}>{t.label}</button>)}
      </div>

      <div style={{padding:'24px 28px',maxWidth:1300,margin:'0 auto'}}>

        {/* OVERVIEW */}
        {tab==='overview'&&(
          <div>
            <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
              <StatCard icon="🏫" label="My Schools"     value={stats?.schoolCount??0} color={COLORS.indigo}/>
              <StatCard icon="👥" label="Total Students" value={stats?.total??0}       color={COLORS.blue}/>
              <StatCard icon="✅" label="Paid"           value={stats?.paid??0} sub={stats?.total?`${Math.round((stats.paid/stats.total)*100)}% conversion`:undefined} color={COLORS.green}/>
              <StatCard icon="⏳" label="Pending"        value={stats?.pending??0}     color={COLORS.amber}/>
              <StatCard icon="💰" label="Revenue"        value={`₹${fmt((stats?.totalRev??0)/100)}`} color={COLORS.purple}/>
            </div>
            {schools.length===0?(
              <div style={{textAlign:'center',padding:'80px 0',color:'var(--m)'}}>
                <div style={{fontSize:56,marginBottom:16}}>🏫</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--text)',marginBottom:8}}>No schools yet</div>
                <button onClick={()=>setShowCreate(true)} style={{background:'#4f46e5',color:'#fff',border:'none',borderRadius:12,padding:'12px 28px',fontSize:14,fontWeight:700,cursor:'pointer'}}>+ Create School</button>
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
                {schools.map((s:Row)=>{
                  const sc=bySchool[s.id]??{total:0,paid:0,pending:0,revenue:0};
                  const pct=sc.total>0?Math.round((sc.paid/sc.total)*100):0;
                  return(
                    <div key={s.id} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'18px 20px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:800,color:'var(--text)',fontFamily:'Sora,sans-serif'}}>{s.name}</div>
                          <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{[s.city,s.state].filter(Boolean).join(', ')}</div>
                        </div>
                        <Badge status={s.is_active?'active':'inactive'}/>
                      </div>
                      <div style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--m)',marginBottom:4}}>
                          <span>Paid conversion</span><span style={{fontWeight:700,color:COLORS.green}}>{pct}%</span>
                        </div>
                        <div style={{height:6,background:'var(--bg)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:COLORS.green,borderRadius:3,transition:'width .4s'}}/>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                        {[{l:'PAID',v:sc.paid,c:COLORS.green},{l:'PENDING',v:sc.pending,c:COLORS.amber},{l:'TOTAL',v:sc.total,c:COLORS.indigo}].map(x=>(
                          <div key={x.l} style={{background:'var(--bg)',borderRadius:10,padding:'8px',textAlign:'center'}}>
                            <div style={{fontSize:20,fontWeight:800,color:x.c}}>{x.v}</div>
                            <div style={{fontSize:9,color:'var(--m)',fontWeight:700}}>{x.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:10,fontSize:12,fontWeight:700,color:COLORS.purple,textAlign:'right'}}>₹{fmt(sc.revenue/100)} revenue</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SCHOOLS */}
        {tab==='schools'&&(
          <div>
            {schools.length===0?(
              <div style={{textAlign:'center',padding:'80px 0',color:'var(--m)'}}>
                <div style={{fontSize:56,marginBottom:16}}>🏫</div>
                <button onClick={()=>setShowCreate(true)} style={{background:'#4f46e5',color:'#fff',border:'none',borderRadius:12,padding:'12px 24px',fontSize:14,fontWeight:700,cursor:'pointer'}}>+ Create School</button>
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:16}}>
                {schools.map((s:Row)=>{
                  const sc=bySchool[s.id]??{total:0,paid:0,pending:0,revenue:0};
                  const lnk=consultantCode?`${BASE_URL}/registration/${s.project_slug}/?consultant=${consultantCode}&school=${s.school_code}`:`${BASE_URL}/registration/${s.project_slug}/?school=${s.school_code}`;
                  return(
                    <div key={s.id} style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'18px 20px',display:'flex',flexDirection:'column',gap:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <div style={{fontSize:15,fontWeight:800,color:'var(--text)',fontFamily:'Sora,sans-serif'}}>{s.name}</div>
                          <div style={{fontSize:11,color:'var(--m)',marginTop:2}}>{s.org_name}</div>
                          <div style={{fontSize:11,color:'var(--m)'}}>{[s.city,s.state,s.country].filter(Boolean).join(', ')}</div>
                        </div>
                        <Badge status={s.is_active?'active':'inactive'}/>
                      </div>
                      <code style={{fontSize:11,background:'var(--bg)',borderRadius:6,padding:'4px 8px',color:'var(--m)',width:'fit-content'}}>{s.school_code}</code>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                        {[{l:'PAID',v:sc.paid,c:COLORS.green},{l:'PENDING',v:sc.pending,c:COLORS.amber},{l:'TOTAL',v:sc.total,c:COLORS.indigo}].map(x=>(
                          <div key={x.l} style={{background:'var(--bg)',borderRadius:10,padding:'8px',textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
                            <div style={{fontSize:9,color:'var(--m)',fontWeight:700}}>{x.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:13,fontWeight:700,color:COLORS.purple}}>₹{fmt(sc.revenue/100)} revenue</div>
                      <div style={{borderTop:'1px solid var(--bd)',paddingTop:10,display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:10,fontWeight:700,color:COLORS.indigo,background:'rgba(79,70,229,.08)',padding:'2px 7px',borderRadius:10,flexShrink:0}}>{consultantCode?'Curated':'Link'}</span>
                        <span style={{fontSize:10,fontFamily:'monospace',color:'var(--m)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{lnk}</span>
                        <button onClick={()=>{navigator.clipboard.writeText(lnk);showToast('📋 Link copied!');}} style={{background:'none',border:'none',cursor:'pointer',color:COLORS.indigo,fontSize:14,flexShrink:0}}>📋</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STUDENTS */}
        {tab==='students'&&(
          <div>
            <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search name, school, phone…" style={{...IS,maxWidth:260,flex:1}}/>
              <select value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)} style={{...IS,maxWidth:200}}>
                <option value="all">All Schools</option>
                {schools.map((s:Row)=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div style={{display:'flex',gap:4}}>
                {(['all','paid','pending'] as const).map(f=>(
                  <button key={f} onClick={()=>setStatusFilter(f)} style={{padding:'8px 14px',borderRadius:8,border:'1.5px solid',borderColor:statusFilter===f?COLORS.indigo:'var(--bd)',background:statusFilter===f?'rgba(79,70,229,.1)':'var(--card)',color:statusFilter===f?COLORS.indigo:'var(--m)',fontSize:12,fontWeight:700,cursor:'pointer',textTransform:'capitalize'}}>{f}</button>
                ))}
              </div>
              <button onClick={exportCSV} style={{background:'rgba(16,185,129,.1)',border:'1.5px solid rgba(16,185,129,.3)',color:'#10b981',borderRadius:10,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>⬇️ Export CSV</button>
              <span style={{fontSize:12,color:'var(--m)',whiteSpace:'nowrap'}}>{filteredRows.length} students</span>
            </div>
            <div style={{overflowX:'auto',borderRadius:14,border:'1.5px solid var(--bd)'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'var(--bg)'}}>
                    {['Date','Student','Grade','Gender','School','Contact','Status','Amount','Paid At'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--m)',textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap',borderBottom:'1.5px solid var(--bd)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length===0?(
                    <tr><td colSpan={9} style={{padding:'50px 0',textAlign:'center',color:'var(--m)'}}>No students found</td></tr>
                  ):filteredRows.map((r:Row,i:number)=>(
                    <tr key={r.id} style={{borderBottom:'1px solid var(--bd)',background:i%2===0?'transparent':'rgba(0,0,0,.012)'}}>
                      <td style={{padding:'10px 14px',color:'var(--m)',whiteSpace:'nowrap',fontSize:12}}>{r.created_at?.slice(0,10)}</td>
                      <td style={{padding:'10px 14px',fontWeight:600,color:'var(--text)'}}>
                        <div>{r.student_name}</div>
                        {r.parent_name&&<div style={{fontSize:11,color:'var(--m)'}}>{r.parent_name}</div>}
                      </td>
                      <td style={{padding:'10px 14px',color:'var(--m)'}}>{r.class_grade}</td>
                      <td style={{padding:'10px 14px'}}><span style={{fontSize:11,fontWeight:600,color:r.gender==='Male'?COLORS.indigo:r.gender==='Female'?'#ec4899':COLORS.amber}}>{r.gender??'—'}</span></td>
                      <td style={{padding:'10px 14px',color:'var(--m)',fontSize:12}}>{r.school_name}</td>
                      <td style={{padding:'10px 14px',color:'var(--m)',fontSize:12}}>
                        <div>{r.contact_phone}</div>
                        <div style={{fontSize:11}}>{r.contact_email}</div>
                      </td>
                      <td style={{padding:'10px 14px'}}><Badge status={r.payment_status??'unknown'}/></td>
                      <td style={{padding:'10px 14px',fontWeight:700,color:'var(--text)',fontFamily:'monospace'}}>{r.final_amount?`₹${fmtR(r.final_amount)}`:'—'}</td>
                      <td style={{padding:'10px 14px',color:'var(--m)',whiteSpace:'nowrap',fontSize:12}}>{r.paid_at?new Date(r.paid_at).toLocaleDateString('en-IN'):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab==='analytics'&&(
          <div style={{display:'flex',flexDirection:'column',gap:20}}>
            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
              <StatCard icon="✅" label="Paid"       value={stats?.paid??0}    color={COLORS.green}/>
              <StatCard icon="⏳" label="Pending"    value={stats?.pending??0} color={COLORS.amber}/>
              <StatCard icon="💰" label="Revenue"    value={`₹${fmt((stats?.totalRev??0)/100)}`} color={COLORS.purple}/>
              <StatCard icon="📊" label="Avg/School" value={stats?.schoolCount>0?Math.round(stats.total/stats.schoolCount):0} sub="students per school" color={COLORS.blue}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'20px 22px'}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Sora,sans-serif',marginBottom:16}}>👥 Gender Distribution</div>
                {genderData.length===0?<div style={{color:'var(--m)',fontSize:13}}>No data yet</div>:(
                  <div style={{display:'flex',alignItems:'center',gap:24}}>
                    <DonutChart slices={genderData.map(([k,v])=>({label:k,value:v,color:gc[k]??COLORS.blue}))} size={100}/>
                    <div style={{display:'flex',flexDirection:'column',gap:8,flex:1}}>
                      {genderData.map(([k,v])=>(
                        <div key={k} style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:10,height:10,borderRadius:3,background:gc[k]??COLORS.blue,flexShrink:0}}/>
                          <span style={{fontSize:13,color:'var(--text)',flex:1}}>{k}</span>
                          <span style={{fontSize:13,fontWeight:700}}>{v}</span>
                          <span style={{fontSize:11,color:'var(--m)'}}>({stats?.total>0?Math.round((v/stats.total)*100):0}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'20px 22px'}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Sora,sans-serif',marginBottom:16}}>💳 Payment Status</div>
                {(stats?.total??0)===0?<div style={{color:'var(--m)',fontSize:13}}>No data yet</div>:(
                  <div style={{display:'flex',alignItems:'center',gap:24}}>
                    <DonutChart size={100} slices={[{label:'Paid',value:stats?.paid??0,color:COLORS.green},{label:'Pending',value:stats?.pending??0,color:COLORS.amber},{label:'Other',value:Math.max(0,(stats?.total??0)-(stats?.paid??0)-(stats?.pending??0)),color:'#e5e7eb'}]}/>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {[{l:'Paid',v:stats?.paid??0,c:COLORS.green},{l:'Pending',v:stats?.pending??0,c:COLORS.amber}].map(x=>(
                        <div key={x.l} style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:10,height:10,borderRadius:3,background:x.c}}/>
                          <span style={{fontSize:13,color:'var(--text)',flex:1}}>{x.l}</span>
                          <span style={{fontSize:13,fontWeight:700}}>{x.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'20px 22px'}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Sora,sans-serif',marginBottom:16}}>📚 Grade-wise Distribution</div>
                {gradeData.length===0?<div style={{color:'var(--m)',fontSize:13}}>No data yet</div>:<BarChart data={gradeData} color={COLORS.indigo} label="Students per grade"/>}
              </div>
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,padding:'20px 22px'}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Sora,sans-serif',marginBottom:16}}>📅 Monthly Trend (6 months)</div>
                {trendData.length===0?<div style={{color:'var(--m)',fontSize:13}}>No data yet</div>:<BarChart data={trendData.map(([k,v])=>[k.slice(5),v])} color={COLORS.green} label="Registrations per month"/>}
              </div>
            </div>
            {schools.length>0&&(
              <div style={{background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:16,overflow:'hidden'}}>
                <div style={{padding:'16px 22px',borderBottom:'1.5px solid var(--bd)',fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Sora,sans-serif'}}>🏫 School-wise Breakdown</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'var(--bg)'}}>
                      {['School','City','Total','Paid','Pending','Revenue','Conversion'].map(h=>(
                        <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--m)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1.5px solid var(--bd)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((s:Row,i:number)=>{
                      const sc=bySchool[s.id]??{total:0,paid:0,pending:0,revenue:0};
                      const pct=sc.total>0?Math.round((sc.paid/sc.total)*100):0;
                      return(
                        <tr key={s.id} style={{borderBottom:'1px solid var(--bd)',background:i%2===0?'transparent':'rgba(0,0,0,.012)'}}>
                          <td style={{padding:'12px 16px',fontWeight:700,color:'var(--text)'}}>
                            <div>{s.name}</div>
                            <div style={{fontSize:11,color:'var(--m)',fontFamily:'monospace'}}>{s.school_code}</div>
                          </td>
                          <td style={{padding:'12px 16px',color:'var(--m)',fontSize:12}}>{[s.city,s.state].filter(Boolean).join(', ')}</td>
                          <td style={{padding:'12px 16px',fontWeight:700,color:COLORS.indigo}}>{sc.total}</td>
                          <td style={{padding:'12px 16px',fontWeight:700,color:COLORS.green}}>{sc.paid}</td>
                          <td style={{padding:'12px 16px',fontWeight:700,color:COLORS.amber}}>{sc.pending}</td>
                          <td style={{padding:'12px 16px',fontWeight:700,color:COLORS.purple,fontFamily:'monospace'}}>₹{fmt(sc.revenue/100)}</td>
                          <td style={{padding:'12px 16px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{flex:1,height:6,background:'var(--bg)',borderRadius:3,overflow:'hidden',minWidth:60}}>
                                <div style={{height:'100%',width:`${pct}%`,background:COLORS.green,borderRadius:3}}/>
                              </div>
                              <span style={{fontSize:12,fontWeight:700,color:COLORS.green,minWidth:32}}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate&&<CreateSchoolModal BACKEND={BACKEND} onClose={()=>setShowCreate(false)} onCreated={()=>{showToast('✅ School created!');load();}}/>}
      {showLinks&&consultantCode&&<CuratedLinksModal schools={schools} consultantCode={consultantCode} onClose={()=>setShowLinks(false)} showToast={showToast}/>}

      {toast&&(
        <div style={{position:'fixed',bottom:24,right:24,background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:14,padding:'12px 20px',fontSize:14,fontWeight:600,color:'var(--text)',zIndex:9999,boxShadow:'0 8px 32px rgba(0,0,0,.12)'}}>
          <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
          {toast}
        </div>
      )}
    </div>
  );
}
