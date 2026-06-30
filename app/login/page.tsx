import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360, background: '#fff', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)', border: '1px solid var(--sand)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 32, fontWeight: 300, letterSpacing: '0.12em', color: 'var(--ink)' }}>
            agio
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 6, letterSpacing: '0.05em' }}>
            サロン管理システム
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
