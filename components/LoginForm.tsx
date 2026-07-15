'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';

interface Props {
  redirectTo: string;
}

export default function LoginForm({ redirectTo }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError('メールアドレスまたはパスワードが正しくありません。');
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="f-row">
        <label className="f-label">メールアドレス</label>
        <input
          className="f-input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="f-row">
        <label className="f-label">パスワード</label>
        <input
          className="f-input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <div className="login-error">{error}</div>}
      <button className="btn-save login-submit" type="submit" disabled={busy}>
        {busy ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  );
}
