'use client';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') ?? '/admin';
  const errorParam   = searchParams.get('error');
  const [error, setError] = useState(
    errorParam === 'no_role' ? 'Your account has no admin access. Contact your administrator.' : ''
  );

  async function doLogin() {
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr || !data.session) {
      setLoading(false);
      setError('Incorrect email or password. Try again.');
      return;
    }
    // Verify user has an admin role (super_admin, sub_admin, or school_admin)
    // Consultants use a different portal — block them here
    const { data: roleRows } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .in('role', ['super_admin', 'sub_admin', 'school_admin']);
    if (!roleRows || roleRows.length === 0) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('You do not have access to the admin panel.');
      return;
    }
    // Small delay to ensure session cookie is set before navigating
    setTimeout(() => {
      window.location.href = redirect;
    }, 500);
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
