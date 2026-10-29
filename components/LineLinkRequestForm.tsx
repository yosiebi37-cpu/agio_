'use client';

import { useState } from 'react';

interface Props {
  /** LIFFのアクセストークン（LINEでログインしたことの証明） */
  getToken: () => string | null;
  /** すでに申請済みで、スタッフの確認待ちか */
  pending: boolean;
  /** すでに連携済みだった場合などに、予約一覧を読み込み直す */
  onLinked: () => void;
}

const boxStyle = { border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 16, background: '#FAFAF8' } as const;

/**
 * LINEの「予約確認」ページで、LINEとお客様情報がまだつながっていない方に表示する「連携申請」フォーム。
 * お店・電話・ホットペッパーで予約した方は、ここでお名前と電話番号を送ってもらい、スタッフが確認してつなぐ。
 */
export default function LineLinkRequestForm({ getToken, pending, onLinked }: Props) {
  const [name, setName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('お名前と電話番号を入力してください。');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/line-link-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: getToken(), name, furigana, phone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? '申請できませんでした。お手数ですが、このLINEのトークでお問い合わせください。');
      return;
    }
    if (data.alreadyLinked) {
      onLinked();
      return;
    }
    setSubmitted(true);
  };

  if (pending || submitted) {
    return (
      <div style={boxStyle} role="status">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>連携の申請を受け付けています</div>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--ink-l)' }}>
          スタッフが確認したあと、このLINEでお知らせします。
          <br />
          確認が終わると、ここにご予約が表示されるようになります。
          <br />
          お急ぎの場合は、このLINEのトークでお問い合わせください。
        </div>
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ご予約が表示されない方へ</div>
      <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--ink-l)', marginBottom: 14 }}>
        お店・お電話・ホットペッパーでご予約いただいた方は、はじめに一度だけ、LINEとお客様情報の連携が必要です。
        <br />
        ご来店時にお伝えいただいたお名前と電話番号を入力して、申請してください。
      </div>

      <label className="f-label" htmlFor="link-name">お名前（フルネーム）</label>
      <input id="link-name" className="f-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例）山田 花子" style={{ fontSize: 16, marginBottom: 12 }} />

      <label className="f-label" htmlFor="link-furigana">フリガナ（任意）</label>
      <input id="link-furigana" className="f-input" type="text" value={furigana} onChange={(e) => setFurigana(e.target.value)} placeholder="例）ヤマダ ハナコ" style={{ fontSize: 16, marginBottom: 12 }} />

      <label className="f-label" htmlFor="link-phone">電話番号</label>
      <input id="link-phone" className="f-input" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例）090-1234-5678" style={{ fontSize: 16, marginBottom: 14 }} />

      {error && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{error}</div>}

      <button className="btn-save" style={{ width: '100%' }} onClick={submit} disabled={busy}>
        {busy ? '送信中…' : '連携を申請する'}
      </button>
      <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 10, lineHeight: 1.7 }}>
        スタッフが確認後、このLINEでお知らせします。連携すると、ご予約の前日にLINEでお知らせが届くようになります。
      </div>
    </div>
  );
}
