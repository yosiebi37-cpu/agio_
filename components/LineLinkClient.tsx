'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LinkResult {
  name: string;
  date: string;
  startTime: string;
  menu: string;
  friend: boolean;
  addFriendUrl: string | null;
}

type Phase = 'loading' | 'done' | 'error';

/**
 * お店で受けた予約のQRコードから開くページ。LINEにログインしてもらい、
 * その予約のお客様（顧客データ）とLINEをつなぐ。つながると、前日のリマインドがLINEに届く。
 */
export default function LineLinkClient() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [stillNotFriend, setStillNotFriend] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const bookingIdRef = useRef<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  const link = useCallback(async (recheck: boolean): Promise<LinkResult | null> => {
    const res = await fetch('/api/line-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tokenRef.current, bookingId: bookingIdRef.current, recheck }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? '連携できませんでした。店舗スタッフにお声がけください。');
      setPhase('error');
      return null;
    }
    const r = data as LinkResult;
    setResult(r);
    setPhase('done');
    return r;
  }, []);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setError('LINEの設定が完了していません。店舗スタッフにお声がけください。');
      setPhase('error');
      return;
    }
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        if (liff.isInClient()) closeRef.current = () => liff.closeWindow();
        bookingIdRef.current = new URLSearchParams(window.location.search).get('b');
        if (!bookingIdRef.current) {
          setError('QRコードを読み取り直してください。');
          setPhase('error');
          return;
        }
        tokenRef.current = liff.getAccessToken();
        if (!tokenRef.current) throw new Error('no access token');
        await link(false);
      } catch {
        setError('LINEアプリから、もう一度QRコードを読み取ってください。');
        setPhase('error');
      }
    })();
  }, [link]);

  const recheck = async () => {
    setChecking(true);
    const r = await link(true);
    setChecking(false);
    setStillNotFriend(Boolean(r && !r.friend));
  };

  return (
    <div className="page-wrap">
      <div className="inner-page" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="login-title" style={{ textAlign: 'center', marginTop: 24 }}>agio</div>
        <div className="login-sub" style={{ textAlign: 'center', marginBottom: 32 }}>LINE連携</div>

        {phase === 'loading' && <div className="empty-row">連携しています…</div>}
        {phase === 'error' && <div className="empty-row" style={{ color: 'var(--red)' }}>{error}</div>}

        {phase === 'done' && result && (
          <>
            <div style={{ border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 16, background: '#FAFAF8' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: 'var(--accent)' }}>✓ 連携が完了しました</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>{result.name} 様</div>
              <div style={{ fontSize: 13, color: 'var(--ink-l)', marginBottom: 4 }}>次回のご予約</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{result.date} {result.startTime}〜</div>
              <div style={{ fontSize: 14, marginBottom: 12 }}>{result.menu}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.7 }}>
                ご予約の前日に、このLINEでお知らせをお送りします。
                <br />
                ご予約の確認・日時の変更・キャンセルも、LINEからできるようになりました。
              </div>
            </div>

            {!result.friend && (
              <div style={{ border: '1px solid var(--gold-d)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>最後にもうひとつだけ</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
                  agioのLINEを「友だち追加」してください。
                  <br />
                  友だち追加していないと、お知らせが届きません。
                </div>
                {result.addFriendUrl && (
                  <a
                    href={result.addFriendUrl}
                    className="btn-save"
                    style={{ display: 'block', textAlign: 'center', padding: '12px 20px', textDecoration: 'none', marginBottom: 10 }}
                  >
                    友だち追加する
                  </a>
                )}
                <button className="btn-cancel" style={{ width: '100%' }} onClick={recheck} disabled={checking}>
                  {checking ? '確認中…' : '友だち追加しました（確認する）'}
                </button>
                {stillNotFriend && !checking && (
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--red)' }}>
                    まだ友だち追加が確認できません。追加してから、もう一度お試しください。
                  </div>
                )}
              </div>
            )}

            {result.friend && closeRef.current && (
              <button className="btn-save" style={{ width: '100%' }} onClick={() => closeRef.current?.()}>
                閉じる
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
