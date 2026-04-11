'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const [count, setCount] = useState(5);

  useEffect(() => {
    const t = setInterval(() => {
      setCount(c => {
        if (c <= 1) {
          clearInterval(t);
          window.location.href = 'https://www.thynksuccess.com';
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card-body" style={{ textAlign: 'center', padding: '40px 32px' }}>
      <div className="success-icon" style={{ display: 'flex' }}>✅</div>
      <h2 style={{ fontFamily: 'Sora', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        Payment Successful!
      </h2>
      <p style={{ color: 'var(--m)', fontSize: 14, marginBottom: 24 }}>
        Your registration has been confirmed. You will receive a confirmation email shortly.
      </p>
      {paymentId && (
        <p style={{ fontSize: 11, color: 'var(--m2)', marginBottom: 24 }}>
          Payment ID: {paymentId}
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--m)' }}>
        Redirecting to <strong>www.thynksuccess.com</strong> in <strong>{count}</strong> seconds…
      </p>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <main className="reg-page">
      <div className="atg-card">
        <div className="card-header">
          <h1>Registration Complete</h1>
          <p>Your seat has been confirmed</p>
        </div>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}>
          <SuccessContent />
        </Suspense>
      </div>
    </main>
  );
}
