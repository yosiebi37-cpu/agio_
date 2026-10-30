'use client';

import { useMemo, useState } from 'react';
import { encodeQr, qrSvgPath } from '@/lib/qr';

interface Props {
  bookingId: string;
}

/**
 * GoogleマップやホームページなどLINEの外から予約したお客様に、予約完了画面で
 * 「LINEで前日のお知らせを受け取る」連携を案内する。
 * 仕組みはお店のQRコード連携（/book/line/link）と同じで、この予約IDを使ってLINEとつなぐ。
 * スマホではボタンを押すとLINEが開き、パソコンではQRコードをスマホで読み取ってもらう。
 */
export default function LineReminderOffer({ bookingId }: Props) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  const [isMobile] = useState(() =>
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
  );

  const linkUrl = liffId ? `https://liff.line.me/${liffId}/link?b=${encodeURIComponent(bookingId)}` : null;

  const qr = useMemo(() => {
    if (!linkUrl || isMobile) return null;
    try {
      return qrSvgPath(encodeQr(linkUrl));
    } catch {
      return null;
    }
  }, [linkUrl, isMobile]);

  if (!linkUrl) return null;

  return (
    <div
      style={{
        marginTop: 32,
        border: '1px solid var(--sand)',
        borderRadius: 12,
        padding: 20,
        background: '#FAFAF8',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>前日にLINEでお知らせします</div>
      <div style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.8, marginBottom: 16 }}>
        LINEとつなぐと、ご予約の前日にLINEでリマインドが届きます。
        <br />
        予約の確認・日時変更・キャンセルもLINEからできるようになります。
      </div>

      {qr && (
        <div style={{ marginBottom: 16 }}>
          <svg
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            width={200}
            height={200}
            shapeRendering="crispEdges"
            role="img"
            aria-label="LINE連携用のQRコード"
            style={{ background: '#fff', borderRadius: 8 }}
          >
            <path d={qr.d} fill="#000" />
          </svg>
          <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 6 }}>
            スマホのカメラでこのQRコードを読み取ってください
          </div>
        </div>
      )}

      <a
        href={linkUrl}
        style={{
          display: 'inline-block',
          padding: '14px 24px',
          borderRadius: 10,
          background: '#06C755',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        LINEで前日のお知らせを受け取る
      </a>
    </div>
  );
}
