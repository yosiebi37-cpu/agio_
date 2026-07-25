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
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);

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

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error: resetError } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError('送信に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    setForgotSent(true);
  };

  if (mode === 'forgot') {
    if (forgotSent) {
      return (
        <div className="login-sub" style={{ marginTop: 8 }}>
          パスワード再設定のメールを送信しました。
          <br />
          メールを確認してリンクを開いてください。
        </div>
      );
    }
    return (
      <form className="login-form" onSubmit={handleForgot}>
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
        {error && <div className="login-error">{error}</div>}
        <button className="btn-save login-submit" type="submit" disabled={busy}>
          {busy ? '送信中…' : '再設定メールを送る'}
        </button>
        <div
          className="login-sub"
          style={{ marginTop: 14, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          ログイン画面に戻る
        </div>
      </form>
    );
  }

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
      <div
        className="login-sub"
        style={{ marginTop: 14, cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => {
          setMode('forgot');
          setError(null);
        }}
      >
        パスワードをお忘れですか？
      </div>
    </form>
  );
}
