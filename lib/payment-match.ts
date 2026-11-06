import { toMinutes } from '@/lib/format';

/**
 * Squareの会計（キーパッド会計で、お客様名やメニューは入っていない）を、
 * 予約ボードの予約と「時間」と「金額」で照らし合わせる。
 *
 * - 会計の時刻が、予約の「開始〜終了の90分後」の間にある
 * - 会計の金額が、予約の金額の7割以上（店販の上乗せ・割引の両方を許容）
 * この条件に合う未来店の予約が1件だけなら、その予約の会計とみなす。
 * 2件以上なら、金額が「予約金額＋店販」とぴったり一致するものが1件だけの時に限って決める。
 * それ以外は勝手に決めず「要確認」にする。
 */

export const AFTER_END_WINDOW_MINUTES = 90;
export const MIN_AMOUNT_RATIO = 0.7;

export interface PaymentForMatch {
  amount: number;
  time: string; // HH:MM（日本時間）
}

export interface BookingForMatch {
  id: string;
  start_time: string; // HH:MM または HH:MM:SS
  end_time: string;
  amount: number;
  status: string;
  /** その予約にひもづいた店販の合計（なければ0） */
  retailTotal?: number;
}

export type PaymentMatch =
  | { status: 'matched'; bookingId: string; candidates: string[] }
  | { status: 'needs_review'; candidates: string[] }
  | { status: 'no_candidate'; candidates: [] };

export function matchPaymentToBooking(
  payment: PaymentForMatch,
  bookings: BookingForMatch[],
  alreadyMatchedBookingIds: Set<string> = new Set(),
): PaymentMatch {
  // まだ来店済みになっていない予約から探し、見つからなければ、先に手で来店済みにした予約からも探す
  // （手で来店済みにしてから会計した場合に、毎回「要確認」にならないようにするため）
  const notVisited = pickFrom(payment, bookings.filter((b) => b.status !== 'visited'), alreadyMatchedBookingIds);
  if (notVisited.status !== 'no_candidate') return notVisited;
  return pickFrom(payment, bookings.filter((b) => b.status === 'visited'), alreadyMatchedBookingIds);
}

function pickFrom(payment: PaymentForMatch, bookings: BookingForMatch[], alreadyMatched: Set<string>): PaymentMatch {
  const paidAt = toMinutes(payment.time);
  const candidates = bookings.filter((b) => {
    if (alreadyMatched.has(b.id)) return false;
    const start = toMinutes(b.start_time);
    const end = toMinutes(b.end_time);
    if (paidAt < start || paidAt > end + AFTER_END_WINDOW_MINUTES) return false;
    if (b.amount > 0 && payment.amount < b.amount * MIN_AMOUNT_RATIO) return false;
    return true;
  });

  if (candidates.length === 0) return { status: 'no_candidate', candidates: [] };
  const ids = candidates.map((b) => b.id);
  if (candidates.length === 1) return { status: 'matched', bookingId: candidates[0].id, candidates: ids };

  const exact = candidates.filter((b) => b.amount + (b.retailTotal ?? 0) === payment.amount);
  if (exact.length === 1) return { status: 'matched', bookingId: exact[0].id, candidates: ids };

  return { status: 'needs_review', candidates: ids };
}
