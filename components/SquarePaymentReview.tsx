'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hhmm, toMinutes, yen } from '@/lib/format';
import type { BookingWithStaff } from '@/lib/types';

export interface PaymentReview {
  id: string;
  amount: number;
  paid_time: string;
  note: string | null;
}

/**
 * Squareの会計のうち、どの予約の会計か自動で決められなかったものを表示する。
 * 予約を選ぶとその予約が「来店済み」になる。予約と関係ない会計は「予約ではない」で消せる。
 */
export default function SquarePaymentReview({ reviews, bookings }: { reviews: PaymentReview[]; bookings: BookingWithStaff[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!reviews.length) return null;

  const resolve = async (paymentId: string, payload: { bookingId?: string; ignore?: boolean }) => {
    setBusy(paymentId);
    const res = await fetch('/api/square-payment-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, ...payload }),
    }).catch(() => null);
    setBusy(null);
    if (!res || !res.ok) {
      alert('保存に失敗しました。もう一度お試しください。');
      return;
    }
    router.refresh();
  };

  const notVisited = bookings.filter((b) => b.status !== 'visited');

  return (
    <div style={{ margin: '8px 16px', padding: 12, borderRadius: 10, background: '#FFF6E5', border: '1px solid #F2D49B' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        <i className="ti ti-receipt"></i> Squareの会計で、どの予約か確認が必要なものがあります
      </div>
      {reviews.map((r) => {
        const paid = toMinutes(r.paid_time);
        const options = [...notVisited]
          .sort((a, b) => Math.abs(toMinutes(a.end_time) - paid) - Math.abs(toMinutes(b.end_time) - paid))
          .slice(0, 4);
        return (
          <div key={r.id} style={{ padding: '8px 0', borderTop: '1px solid #F2D49B' }}>
            <div style={{ fontSize: 14 }}>
              {hhmm(r.paid_time)} の会計 <b>{yen(r.amount)}</b>
              {r.note && <span style={{ color: '#8a6d3b', fontSize: 12, marginLeft: 8 }}>{r.note}</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {options.map((b) => (
                <button
                  key={b.id}
                  className="btn-sm"
                  disabled={busy === r.id}
                  onClick={() => resolve(r.id, { bookingId: b.id })}
                >
                  {hhmm(b.start_time)}〜 {b.customer_name} 様（{yen(b.amount)}）を来店済みに
                </button>
              ))}
              <button className="btn-sm" disabled={busy === r.id} onClick={() => resolve(r.id, { ignore: true })}>
                予約ではない
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
