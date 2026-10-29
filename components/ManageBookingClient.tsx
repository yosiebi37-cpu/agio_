'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { yen, formatDateLong, toISODate } from '@/lib/format';
import LineLinkRequestForm from './LineLinkRequestForm';

interface ManagedBooking {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  menu: string;
  staffName: string;
  amount: number;
  modifiable: boolean;
  /** manual = agioで受けた予約、hotpepper / square = それぞれのサービスから入った予約 */
  source?: string;
}

type Phase = 'loading' | 'ready' | 'error';

export default function ManageBookingClient() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ManagedBooking[]>([]);
  const [deadlineHour, setDeadlineHour] = useState(18);
  // このLINEがお客様情報とつながっているか（つながっていなければ連携申請フォームを出す）
  const [linked, setLinked] = useState(true);
  const [pendingRequest, setPendingRequest] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [starts, setStarts] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/booking-manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tokenRef.current, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }, []);

  const loadBookings = useCallback(async () => {
    const { ok, data } = await call({ action: 'list' });
    if (!ok) {
      setError(data.error ?? '予約を読み込めませんでした。');
      setPhase('error');
      return;
    }
    setBookings(data.bookings ?? []);
    setLinked(data.linked !== false);
    setPendingRequest(Boolean(data.pendingRequest));
    if (data.deadlineHour) setDeadlineHour(data.deadlineHour);
    setPhase('ready');
  }, [call]);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setError('LINEの設定が完了していません。店舗までご連絡ください。');
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
        tokenRef.current = liff.getAccessToken();
        if (!tokenRef.current) throw new Error('no access token');
        await loadBookings();
      } catch {
        setError('LINEアプリから、もう一度開いてください。');
        setPhase('error');
      }
    })();
  }, [loadBookings]);

  const startEditing = (b: ManagedBooking) => {
    setEditingId(b.id);
    setNewDate('');
    setStarts(null);
    setStartTime(null);
    setActionError(null);
    setNotice(null);
  };

  const stopEditing = () => {
    setEditingId(null);
    setNewDate('');
    setStarts(null);
    setStartTime(null);
    setActionError(null);
  };

  const onDateChange = async (bookingId: string, date: string) => {
    setNewDate(date);
    setStartTime(null);
    setStarts(null);
    setActionError(null);
    if (!date) return;
    setLoadingSlots(true);
    const { ok, data } = await call({ action: 'slots', bookingId, date });
    setLoadingSlots(false);
    if (!ok) {
      setActionError(data.error ?? '空き状況を確認できませんでした。');
      return;
    }
    setStarts(data.starts ?? []);
  };

  const reschedule = async (b: ManagedBooking) => {
    if (!newDate || !startTime) return;
    if (!window.confirm(`${formatDateLong(newDate)} ${startTime}〜 に変更しますか？`)) return;
    setBusy(true);
    setActionError(null);
    const { ok, data } = await call({ action: 'reschedule', bookingId: b.id, date: newDate, startTime });
    setBusy(false);
    if (!ok) {
      setActionError(data.error ?? '日時の変更に失敗しました。');
      if (data.error && data.error.includes('埋まって')) void onDateChange(b.id, newDate);
      return;
    }
    stopEditing();
    setNotice(`ご予約の日時を ${formatDateLong(newDate)} ${startTime}〜 に変更しました。`);
    await loadBookings();
  };

  const cancel = async (b: ManagedBooking) => {
    if (!window.confirm(`${formatDateLong(b.date)} ${b.startTime}〜 のご予約をキャンセルしますか？`)) return;
    setBusy(true);
    setActionError(null);
    const { ok, data } = await call({ action: 'cancel', bookingId: b.id });
    setBusy(false);
    if (!ok) {
      setActionError(data.error ?? 'キャンセルに失敗しました。');
      return;
    }
    stopEditing();
    setNotice('ご予約をキャンセルしました。');
    await loadBookings();
  };

  return (
    <div className="page-wrap">
      <div className="inner-page" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="login-title" style={{ textAlign: 'center', marginTop: 24 }}>agio</div>
        <div className="login-sub" style={{ textAlign: 'center', marginBottom: 32 }}>ご予約の確認・変更</div>

        {phase === 'loading' && <div className="empty-row">読み込み中…</div>}
        {phase === 'error' && <div className="empty-row" style={{ color: 'var(--red)' }}>{error}</div>}

        {phase === 'ready' && (
          <>
            {notice && (
              <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--accent)' }} role="status">{notice}</div>
            )}
            {!linked && (
              <LineLinkRequestForm getToken={() => tokenRef.current} pending={pendingRequest} onLinked={() => void loadBookings()} />
            )}
            {linked && bookings.length === 0 && (
              <div className="empty-row">現在、これからのご予約はありません。</div>
            )}

            {bookings.map((b) => (
              <div key={b.id} style={{ border: '1px solid var(--sand)', borderRadius: 12, padding: 16, marginBottom: 16, background: '#FAFAF8' }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  {formatDateLong(b.date)} {b.startTime}〜{b.endTime}
                </div>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{b.menu}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-l)' }}>
                  担当: {b.staffName || '—'} ／ {yen(b.amount)}<span style={{ fontSize: 11 }}>（税込）</span>
                </div>

                {(b.source ?? 'manual') !== 'manual' && (
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.7 }}>
                    {b.source === 'hotpepper' ? 'ホットペッパーからのご予約です。' : 'こちらは店舗でお受けしたご予約です。'}
                    <br />
                    ご変更・キャンセルは、{b.source === 'hotpepper' ? 'ホットペッパーのページから' : '店舗まで直接'}お願いいたします。
                  </div>
                )}

                {!b.modifiable && (b.source ?? 'manual') === 'manual' && (
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.7 }}>
                    ご変更・キャンセルは、ご予約の前日の{deadlineHour}時までとなっております。
                    <br />
                    お手数ですが、店舗まで直接ご連絡ください。
                  </div>
                )}

                {b.modifiable && editingId !== b.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="btn-save" style={{ flex: 1 }} onClick={() => startEditing(b)} disabled={busy}>
                      日時を変更
                    </button>
                    <button className="btn-cancel" style={{ flex: 1 }} onClick={() => cancel(b)} disabled={busy}>
                      キャンセル
                    </button>
                  </div>
                )}

                {b.modifiable && editingId === b.id && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--sand)', paddingTop: 14 }}>
                    <label className="f-label" htmlFor={`new-date-${b.id}`}>変更後の日付</label>
                    <input
                      id={`new-date-${b.id}`}
                      className="f-input"
                      type="date"
                      min={toISODate(new Date())}
                      value={newDate}
                      onChange={(e) => onDateChange(b.id, e.target.value)}
                      style={{ fontSize: 16, marginBottom: 12 }}
                    />

                    {loadingSlots && <div className="empty-row">空き状況を確認しています…</div>}
                    {starts && starts.length === 0 && (
                      <div className="empty-row">この日は空きがありません。別の日をお選びください。</div>
                    )}
                    {starts && starts.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                        {starts.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={startTime === s}
                            onClick={() => setStartTime(s)}
                            style={{
                              padding: '10px 16px', minHeight: 44, borderRadius: 22, fontSize: 14, border: 'none', cursor: 'pointer',
                              background: startTime === s ? 'var(--ink)' : 'var(--sand)',
                              color: startTime === s ? '#fff' : 'var(--ink)',
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}

                    {actionError && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{actionError}</div>}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-cancel" style={{ flex: 1 }} onClick={stopEditing} disabled={busy}>
                        やめる
                      </button>
                      <button className="btn-save" style={{ flex: 2 }} onClick={() => reschedule(b)} disabled={busy || !startTime}>
                        {busy ? '変更中…' : 'この日時に変更する'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {actionError && editingId === null && (
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{actionError}</div>
            )}

            <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13 }}>
              <Link href="/book/line" style={{ color: 'var(--ink-l)' }}>新しくご予約される方はこちら</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
