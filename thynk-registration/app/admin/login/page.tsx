'use client';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/admin';

  async function doLogin() {
    setError(''); setLoading(true);
    const supabase = createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authErr) { setError('Incorrect email or password. Try again.'); return; }
    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="login-card">
      <h2>Admin Login</h2>
      <p>Thynk SaaS · Dashboard</p>
      <input
        type="email" placeholder="Email address"
        value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && doLogin()}
      />
      <input
        type="password" placeholder="Password"
        value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && doLogin()}
      />
      <button onClick={doLogin} disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In →'}
      </button>
      {error && <div className="lerr" style={{ display: 'block' }}>{error}</div>}
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div id="loginScreen">
      <div className="login-wrap">
        <div className="login-logo">📊</div>
        <Suspense fallback={<div className="login-card"><p>Loading…</p></div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
