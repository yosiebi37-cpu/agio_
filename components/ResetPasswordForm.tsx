'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getBrowserSupabase();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください。');
      return;
    }
    if (password !== confirm) {
      setError('パスワードが一致しません。');
      return;
    }
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error: updateError } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError('パスワードの更新に失敗しました。もう一度リンクを送り直してください。');
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push('/board');
      router.refresh();
    }, 1500);
  };

  if (done) {
    return <div className="login-sub" style={{ marginTop: 8 }}>パスワードを変更しました。移動します…</div>;
  }

  if (!ready) {
    return (
      <div className="login-sub" style={{ marginTop: 8 }}>
        リンクを確認しています…
        <br />
        うまく開かない場合は、メールのリンクをもう一度タップしてください。
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="f-row">
        <label className="f-label">新しいパスワード</label>
        <input
          className="f-input"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="f-row">
        <label className="f-label">新しいパスワード（確認）</label>
        <input
          className="f-input"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <div className="login-error">{error}</div>}
      <button className="btn-save login-submit" type="submit" disabled={busy}>
        {busy ? '保存中…' : 'パスワードを変更する'}
      </button>
    </form>
  );
}
