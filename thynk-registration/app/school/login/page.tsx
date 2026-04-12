'use client';
import { Suspense, useState } from 'react';
import { createClient, authFetch } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

function SchoolLoginForm() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/school/dashboard';

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
    // Verify user has school_admin role
    const { data: role } = await supabase
      .from('admin_roles')
      .select('role, school_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (!role) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('You do not have access to the school dashboard.');
      return;
    }
    setTimeout(() => { window.location.href = redirect; }, 400);
  }

  return (
    <div style={{
      background:'var(--card)',border:'1.5px solid var(--bd)',borderRadius:20,
      padding:'40px 36px',maxWidth:400,width:'100%',boxShadow:'0 8px 40px rgba(0,0,0,.08)'
    }}>
      <div style={{fontSize:40,marginBottom:12,textAlign:'center'}}>🏫</div>
      <h2 style={{margin:'0 0 4px',fontSize:22,fontWeight:800,textAlign:'center',color:'var(--text)'}}>School Portal</h2>
      <p style={{margin:'0 0 28px',fontSize:13,color:'var(--m)',textAlign:'center'}}>Sign in to view your school dashboard</p>

      <div style={{marginBottom:16}}>
        <label style={{fontSize:12,fontWeight:600,color:'var(--m)',display:'block',marginBottom:6}}>Email address</label>
        <input
          type="email" value={email} placeholder="school@example.com"
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doLogin()}
          style={{width:'100%',border:'1.5px solid var(--bd)',borderRadius:10,padding:'10px 14px',
                  fontSize:14,fontFamily:'DM Sans,sans-serif',outline:'none',
                  color:'var(--text)',background:'var(--bg)',boxSizing:'border-box'}}
        />
      </div>
      <div style={{marginBottom:24}}>
        <label style={{fontSize:12,fontWeight:600,color:'var(--m)',display:'block',marginBottom:6}}>Password</label>
        <input
          type="password" value={password} placeholder="••••••••"
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doLogin()}
          style={{width:'100%',border:'1.5px solid var(--bd)',borderRadius:10,padding:'10px 14px',
                  fontSize:14,fontFamily:'DM Sans,sans-serif',outline:'none',
                  color:'var(--text)',background:'var(--bg)',boxSizing:'border-box'}}
        />
      </div>

      {error && (
        <div style={{background:'var(--red2)',color:'var(--red)',borderRadius:10,padding:'10px 14px',
                     fontSize:13,marginBottom:16,fontWeight:500}}>
          ⚠️ {error}
        </div>
      )}

      <button
        onClick={doLogin} disabled={loading}
        style={{width:'100%',background:'var(--acc)',color:'#fff',border:'none',borderRadius:10,
                padding:'12px',fontSize:15,fontWeight:700,cursor:loading?'not-allowed':'pointer',
                opacity:loading?0.7:1,fontFamily:'DM Sans,sans-serif'}}
      >
        {loading ? 'Signing in…' : 'Sign In →'}
      </button>
    </div>
  );
}

export default function SchoolLoginPage() {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
                 background:'var(--bg)',padding:16}}>
      <Suspense fallback={<div>Loading…</div>}>
        <SchoolLoginForm />
      </Suspense>
    </div>
  );
}
