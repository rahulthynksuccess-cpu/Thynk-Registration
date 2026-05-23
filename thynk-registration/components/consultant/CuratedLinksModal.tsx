'use client';
import React from 'react';

const BASE_URL = 'https://thynksuccess.com';
type Row = Record<string,any>;

export function CuratedLinksModal({ schools, consultantCode, onClose, showToast }:
  { schools:Row[]; consultantCode:string; onClose:()=>void; showToast:(m:string)=>void }) {

  function copy(url:string, label:string) {
    navigator.clipboard.writeText(url);
    showToast(`📋 ${label} copied!`);
  }

  function copyAll() {
    const lines = schools.map(s =>
      `${s.name}: ${BASE_URL}/registration/${s.project_slug}/?consultant=${consultantCode}&school=${s.school_code}`
    );
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('📋 All links copied!');
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,
                  display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:20,
                    width:'100%',maxWidth:640,maxHeight:'88vh',display:'flex',flexDirection:'column',
                    padding:'28px 28px 24px' }}>

        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6 }}>
          <div>
            <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:'var(--text)',fontFamily:'Sora,sans-serif' }}>🔗 Your Registration Links</h2>
            <div style={{ fontSize:12,color:'var(--m)',marginTop:3 }}>
              Curated links — tagged to you automatically · Code:
              <code style={{ fontSize:11,background:'var(--bg)',padding:'1px 6px',borderRadius:4,
                             color:'#4f46e5',fontWeight:700,marginLeft:4 }}>{consultantCode}</code>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--m)' }}>✕</button>
        </div>

        <div style={{ overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:10,marginTop:16 }}>
          {schools.length===0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--m)' }}>No schools yet</div>
          ) : schools.map((s:Row) => {
            const link = `${BASE_URL}/registration/${s.project_slug}/?consultant=${consultantCode}&school=${s.school_code}`;
            return (
              <div key={s.id} style={{ border:'1.5px solid var(--bd)',borderRadius:12,overflow:'hidden' }}>
                <div style={{ background:'var(--bg)',padding:'7px 14px',borderBottom:'1px solid var(--bd)',
                              display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ fontSize:13,fontWeight:700,color:'var(--text)' }}>🏫 {s.name}</span>
                  <code style={{ fontSize:10,background:'rgba(79,70,229,.1)',color:'#4f46e5',
                                 padding:'1px 7px',borderRadius:10,fontWeight:700 }}>{s.school_code}</code>
                </div>
                <div style={{ padding:'10px 14px',display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ fontFamily:'monospace',fontSize:11,color:'var(--text)',background:'var(--bg)',
                                 padding:'5px 10px',borderRadius:6,wordBreak:'break-all',flex:1,lineHeight:1.5 }}>{link}</span>
                  <button onClick={()=>copy(link,s.name)}
                    style={{ flexShrink:0,padding:'5px 11px',borderRadius:7,cursor:'pointer',
                             border:'1.5px solid rgba(79,70,229,.3)',background:'rgba(79,70,229,.06)',
                             color:'#4f46e5',fontSize:11,fontWeight:700 }}>📋 Copy</button>
                </div>
              </div>
            );
          })}
        </div>

        {schools.length>0 && (
          <div style={{ marginTop:16,display:'flex',justifyContent:'flex-end',gap:10,
                        paddingTop:14,borderTop:'1px solid var(--bd)' }}>
            <button onClick={onClose} style={{ padding:'9px 18px',borderRadius:10,border:'1.5px solid var(--bd)',
                                               background:'var(--card)',color:'var(--m)',fontSize:13,fontWeight:700,cursor:'pointer' }}>Close</button>
            <button onClick={copyAll} style={{ padding:'9px 20px',borderRadius:10,
                                               background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                                               border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer' }}>
              📋 Copy All Links
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
