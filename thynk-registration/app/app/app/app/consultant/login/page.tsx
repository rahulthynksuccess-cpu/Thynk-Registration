'use client';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

function ConsultantLoginForm() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/consultant/dashboard';

  async function doLogin() {
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr || !data.session) {
      setLoading(false);
      setError('Incorrect email or password. Please try again.');
      return;
    }
    // Verify user has consultant role
    const { data: role } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .eq('role', 'consultant')
      .maybeSingle();

    if (!role) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('You do not have consultant access.');
      return;
    }
    setTimeout(() => { window.location.href = redirect; }, 400);
  }

  const IS: React.CSSProperties = {
    width:'100%', border:'1.5px solid var(--bd)', borderRadius:10, padding:'10px 14px',
    fontSize:14, fontFamily:'DM Sans,sans-serif', outline:'none',
    color:'var(--text)', background:'var(--bg)', boxSizing:'border-box',
  };

  return (
    <div style={{
      background:'var(--card)', border:'1.5px solid var(--bd)', borderRadius:20,
      padding:'40px 36px', maxWidth:400, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,.08)'
    }}>
      <div style={{fontSize:40, marginBottom:12, textAlign:'center'}}>🤝</div>
      <h2 style={{margin:'0 0 4px', fontSize:22, fontWeight:800, textAlign:'center', color:'var(--text)'}}>Consultant Portal</h2>
      <p style={{margin:'0 0 28px', fontSize:13, color:'var(--m)', textAlign:'center'}}>Sign in to manage your schools</p>

      <div style={{marginBottom:16}}>
        <label style={{fontSize:12, fontWeight:600, color:'var(--m)', display:'block', marginBottom:6}}>Email address</label>
        <input type="email" value={email} placeholder="you@example.com"
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doLogin()}
          style={IS} />
      </div>
      <div style={{marginBottom:24}}>
        <label style={{fontSize:12, fontWeight:600, color:'var(--m)', display:'block', marginBottom:6}}>Password</label>
        <input type="password" value={password} placeholder="Enter your password"
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doLogin()}
          style={IS} />
      </div>

      {error && (
        <div style={{background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10,
                     padding:'10px 14px', fontSize:13, color:'#ef4444', marginBottom:16}}>
          {error}
        </div>
      )}

      <button onClick={doLogin} disabled={loading} style={{
        width:'100%', background: loading ? 'rgba(79,70,229,.6)' : '#4f46e5',
        color:'#fff', border:'none', borderRadius:12, padding:'12px 0',
        fontSize:15, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily:'DM Sans,sans-serif',
      }}>
        {loading ? '⏳ Signing in…' : 'Sign In'}
      </button>
    </div>
  );
}

export default function ConsultantLoginPage() {
  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', fontFamily:'DM Sans,sans-serif', padding:16,
    }}>
      <Suspense>
        <ConsultantLoginForm />
      </Suspense>
    </div>
  );
}
