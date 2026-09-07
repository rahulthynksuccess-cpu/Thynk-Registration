export default function NotFound() {
  return (
    <main className="reg-page">
      <div className="atg-card">
        <div className="card-header">
          <h1>Page Not Found</h1>
          <p>This registration link is invalid or has expired.</p>
        </div>
        <div className="card-body" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <p style={{ color: 'var(--m)', fontSize: 14 }}>
            Please check the link you were given, or contact the organiser for the correct registration URL.
          </p>
        </div>
      </div>
    </main>
  );
}
