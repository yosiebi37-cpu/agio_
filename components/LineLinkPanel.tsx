'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate } from '@/lib/format';
import { encodeQr, qrSvgPath } from '@/lib/qr';

interface Props {
  bookingId: string;
  customerId: string | null;
  bookingDate: string;
  status: string;
}

/**
 * 予約の編集画面に出す「LINEリマインド」欄。
 * お客様のLINEが連携済みかを表示し、未連携ならその場で読み取ってもらうQRコードを出す。
 * 連携されると、お店で受けた予約でも前日にLINEでリマインドが届く。
 */
export default function LineLinkPanel({ bookingId, customerId, bookingDate, status }: Props) {
  // undefined = 確認中、null = 未連携、文字列 = 連携済み
  const [lineUserId, setLineUserId] = useState<string | null | undefined>(undefined);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  const upcoming = bookingDate >= toISODate(new Date()) && status !== 'visited';

  const load = useCallback(async () => {
    if (!customerId) return;
    const { data } = await getBrowserSupabase().from('customers').select('line_user_id').eq('id', customerId).maybeSingle();
    setLineUserId((data?.line_user_id as string | null | undefined) ?? null);
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // QRコードを出している間は、読み取ってもらえたかを数秒おきに確認する
  useEffect(() => {
    if (!showQr || lineUserId) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [showQr, lineUserId, load]);

  const qr = useMemo(() => {
    if (!showQr || !liffId) return null;
    try {
      return qrSvgPath(encodeQr(`https://liff.line.me/${liffId}/link?b=${bookingId}`));
    } catch {
      return null;
    }
  }, [showQr, liffId, bookingId]);

  const unlink = async () => {
    if (!customerId) return;
    if (!window.confirm('このお客様のLINE連携を解除しますか？\n（解除すると、前日のLINEリマインドが届かなくなります）')) return;
    setBusy(true);
    await getBrowserSupabase().from('customers').update({ line_user_id: null }).eq('id', customerId);
    setBusy(false);
    setShowQr(false);
    await load();
  };

  const note = (text: string) => <div style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.7 }}>{text}</div>;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--sand)', paddingTop: 14 }}>
      <label className="f-label">LINEリマインド</label>

      {!customerId && note('この予約は顧客データに紐付いていないため、LINE連携できません。')}

      {customerId && lineUserId === undefined && note('確認中…')}

      {customerId && lineUserId && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, color: '#06C755', fontWeight: 600 }}>✓ LINE連携済み（前日にLINEでお知らせが届きます）</div>
          <button className="btn-sm" onClick={unlink} disabled={busy}>連携を解除</button>
        </div>
      )}

      {customerId && lineUserId === null && !upcoming && note('LINE未連携です。次の予約を入れたときに、予約画面のQRコードから連携できます。')}

      {customerId && lineUserId === null && upcoming && !liffId && note('LINEの設定（LIFF ID）が見つからないため、QRコードを表示できません。')}

      {customerId && lineUserId === null && upcoming && liffId && (
        <>
          {note('LINE未連携のため、このままでは前日のLINEリマインドが届きません。')}
          {!showQr && (
            <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => setShowQr(true)}>
              <i className="ti ti-qrcode"></i>LINE連携用のQRコードを表示
            </button>
          )}
          {showQr && qr && (
            <div style={{ marginTop: 10, textAlign: 'center' }}>
              <svg
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                width={220}
                height={220}
                shapeRendering="crispEdges"
                role="img"
                aria-label="LINE連携用のQRコード"
                style={{ background: '#fff', borderRadius: 8 }}
              >
                <path d={qr.d} fill="#000" />
              </svg>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>
                お客様のスマホのカメラで読み取ってもらってください。
                <br />
                LINEが開いて、連携が完了します。
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 4 }}>（連携されると、ここが自動で「連携済み」に変わります）</div>
            </div>
          )}
          {showQr && !qr && note('QRコードを作れませんでした。')}
        </>
      )}
    </div>
  );
}
