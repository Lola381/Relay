'use client';

/** Last-resort fallback if the root layout itself crashes (renders its own <html>). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '64px 24px', background: '#fff', color: '#111' }}>
        <h1 style={{ fontSize: 48, fontWeight: 300, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: '#555', marginTop: 24 }}>The app hit an unexpected error.</p>
        <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
          <button onClick={reset} style={{ background: '#00747c', color: '#fff', border: 0, padding: '10px 20px', cursor: 'pointer' }}>
            Reload
          </button>
          <a href="/dashboard" style={{ border: '2px solid #999', padding: '8px 20px', color: 'inherit', textDecoration: 'none' }}>
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
