'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません。');
      setLoading(false);
      return;
    }

    router.push('/board');
    router.refresh();
  };

  return (
    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ fontSize: 11, color: 'var(--ink-m)', display: 'block', marginBottom: 5 }}>
          メールアドレス
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid var(--sand)',
            borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'var(--ink-m)', display: 'block', marginBottom: 5 }}>
          パスワード
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid var(--sand)',
            borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 10px', background: '#FFF0F0', borderRadius: 6 }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 4, padding: '12px', background: 'var(--green)', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  );
}
