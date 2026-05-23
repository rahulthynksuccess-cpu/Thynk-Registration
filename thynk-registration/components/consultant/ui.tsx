'use client';
import React from 'react';

export const COLORS = {
  indigo: '#4f46e5', purple: '#7c3aed', green: '#10b981',
  amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6',
};

export const IS: React.CSSProperties = {
  width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 14px',
  fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none',
  color:'var(--text)', background:'var(--bg)', boxSizing:'border-box',
};

export const fmtR = (p: number) => (p / 100).toLocaleString('en-IN');
export const fmt  = (n: any) => {
  const v = parseFloat(String(n ?? 0).replace(/[^0-9.]/g, ''));
  return isNaN(v) ? '0' : v.toLocaleString('en-IN');
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase',
                      letterSpacing:'0.5px', display:'block', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  const map: Record<string,[string,string]> = {
    paid:       ['#d1fae5','#065f46'], initiated: ['#ede9fe','#3730a3'],
    pending:    ['#fef3c7','#92400e'], failed:    ['#fee2e2','#991b1b'],
    approved:   ['#d1fae5','#065f46'], active:    ['#d1fae5','#065f46'],
    registered: ['#dbeafe','#1e40af'],
  };
  const [bg, fg] = map[status?.toLowerCase()] ?? ['#f3f4f6','#374151'];
  return (
    <span style={{ background:bg, color:fg, borderRadius:20, padding:'3px 10px',
                   fontSize:11, fontWeight:700, textTransform:'capitalize' }}>{status ?? '—'}</span>
  );
}

export function StatCard({ icon, label, value, sub, color }:
  { icon:string; label:string; value:any; sub?:string; color:string }) {
  return (
    <div style={{ background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:16,
                  padding:'20px 22px', flex:1, minWidth:140, borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color:'var(--text)', fontFamily:'Sora,sans-serif', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12, color:'var(--m)', fontWeight:600, marginTop:6 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color, fontWeight:700, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

export function BarChart({ data, color, label }:
  { data:[string,number][]; color:string; label:string }) {
  const max = Math.max(...data.map(d => d[1]), 1);
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--m)', textTransform:'uppercase',
                    letterSpacing:'0.5px', marginBottom:12 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80 }}>
        {data.map(([k,v]) => (
          <div key={k} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ fontSize:10, fontWeight:700, color }}>{v||''}</div>
            <div style={{ width:'100%', background:color, borderRadius:'4px 4px 0 0', opacity:v>0?1:0.15,
                          height:`${Math.max((v/max)*64, v>0?4:0)}px`, transition:'height .3s' }} />
            <div style={{ fontSize:9, color:'var(--m)', fontWeight:600, textAlign:'center',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:36 }}>{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ slices, size=90 }:
  { slices:{label:string;value:number;color:string}[]; size?:number }) {
  const total = slices.reduce((s,x) => s+x.value, 0);
  if (total === 0) return <div style={{ width:size, height:size, borderRadius:'50%', background:'var(--bd)' }} />;
  let angle = -90;
  const paths = slices.map(s => {
    const pct = s.value/total; const a1=angle; const a2=angle+pct*360;
    const r1=(a1*Math.PI)/180; const r2=(a2*Math.PI)/180;
    const x1=50+38*Math.cos(r1); const y1=50+38*Math.sin(r1);
    const x2=50+38*Math.cos(r2); const y2=50+38*Math.sin(r2);
    const d=`M 50 50 L ${x1} ${y1} A 38 38 0 ${pct>0.5?1:0} 1 ${x2} ${y2} Z`;
    angle=a2; return { d, color:s.color };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {paths.map((p,i) => <path key={i} d={p.d} fill={p.color} />)}
      <circle cx="50" cy="50" r="22" fill="var(--card)" />
    </svg>
  );
}
