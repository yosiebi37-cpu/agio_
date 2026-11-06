import type { SupabaseClient } from '@supabase/supabase-js';
import { getSquareLocationId, utcIsoToJst } from '@/lib/square';
import { findMatchingCustomer, type MatchCandidate } from '@/lib/customer-match';
import { initialsFromName } from '@/lib/format';
import { matchPaymentToBooking, type BookingForMatch } from '@/lib/payment-match';

/** Squareの決済Webhook（payment.created / payment.updated）の中身で使う部分 */
export interface SquarePayment {
  id: string;
  status?: string;
  created_at?: string;
  location_id?: string;
  total_money?: { amount?: number; currency?: string };
  amount_money?: { amount?: number; currency?: string };
}

export function extractPayment(payload: { data?: { object?: { payment?: SquarePayment } } }): SquarePayment | null {
  return payload.data?.object?.payment ?? null;
}

/**
 * 予約を「来店済み」にする（予約ボードの「来店済みに」ボタンと同じ処理をサーバー側で行う）。
 * お客様情報への紐付けと、カルテ（施術履歴）への反映も行う。
 */
export async function markBookingVisitedServer(sb: SupabaseClient, bookingId: string): Promise<void> {
  const { data: b } = await sb
    .from('bookings')
    .select('id,customer_id,customer_name,customer_type,staff_id,booking_date,menu,amount,note,status')
    .eq('id', bookingId)
    .maybeSingle();
  // すでに来店済みなら何もしない（手で直したカルテの内容を上書きしないため）
  if (!b || b.status === 'visited') return;

  await sb.from('bookings').update({ status: 'visited' }).eq('id', b.id);

  let customerId = b.customer_id as string | null;
  if (!customerId) {
    const { data: candidates } = await sb
      .from('customers')
      .select('id,name,furigana,phone,line_user_id,customer_type,visit_count');
    const existing = findMatchingCustomer((candidates ?? []) as MatchCandidate[], { name: b.customer_name })?.customer;
    customerId = existing?.id ?? null;
    if (!customerId) {
      const { data: created } = await sb
        .from('customers')
        .insert({ name: b.customer_name, initials: initialsFromName(b.customer_name), customer_type: b.customer_type })
        .select('id')
        .single();
      customerId = (created?.id as string | undefined) ?? null;
    }
    if (customerId) await sb.from('bookings').update({ customer_id: customerId }).eq('id', b.id);
  }

  if (customerId) {
    await sb.from('treatment_records').upsert(
      {
        booking_id: b.id,
        customer_id: customerId,
        staff_id: b.staff_id,
        performed_on: b.booking_date,
        menu: b.menu,
        amount: b.amount,
        note: b.note,
      },
      { onConflict: 'booking_id' },
    );
  }
}

/** agioの店舗（Squareのロケーション）。aroなど別の店舗の会計を取り違えないために使う */
async function agioLocationId(accessToken: string): Promise<string | null> {
  return process.env.SQUARE_LOCATION_ID?.trim() || (await getSquareLocationId(accessToken));
}

export type PaymentHandleResult = 'matched' | 'needs_review' | 'ignored' | 'skipped';

/**
 * Squareで会計が完了したら、その日の予約と照らし合わせて「来店済み」にする。
 * 1件に決められない時は「要確認」として残し、予約ボードで選べるようにする。
 */
export async function handleSquarePayment(
  sb: SupabaseClient,
  payment: SquarePayment,
  accessToken: string,
): Promise<{ result: PaymentHandleResult; message: string }> {
  if (payment.status !== 'COMPLETED') return { result: 'skipped', message: `未完了の会計です（${payment.status ?? '不明'}）` };
  if (!payment.created_at) return { result: 'skipped', message: '会計日時がありません' };

  const locationId = await agioLocationId(accessToken);
  if (locationId && payment.location_id && payment.location_id !== locationId) {
    return { result: 'skipped', message: 'agio以外の店舗の会計です' };
  }

  // 同じ会計のお知らせは何度か届くことがあるため、記録済みなら何もしない
  const { data: existing } = await sb
    .from('square_payments')
    .select('id')
    .eq('square_payment_id', payment.id)
    .maybeSingle();
  if (existing) return { result: 'skipped', message: '記録済みの会計です' };

  const amount = payment.total_money?.amount ?? payment.amount_money?.amount ?? 0;
  const { date, time } = utcIsoToJst(payment.created_at);

  const [{ data: bookings }, { data: retail }, { data: matchedToday }] = await Promise.all([
    sb.from('bookings').select('id,start_time,end_time,amount,status').eq('booking_date', date),
    sb.from('retail_sales').select('booking_id,amount').eq('sale_date', date),
    sb.from('square_payments').select('booking_id').eq('paid_on', date).not('booking_id', 'is', null),
  ]);

  const retailByBooking = new Map<string, number>();
  for (const r of retail ?? []) {
    if (!r.booking_id) continue;
    retailByBooking.set(r.booking_id, (retailByBooking.get(r.booking_id) ?? 0) + (r.amount ?? 0));
  }
  const forMatch: BookingForMatch[] = (bookings ?? []).map((bk) => ({
    id: bk.id,
    start_time: bk.start_time,
    end_time: bk.end_time,
    amount: bk.amount ?? 0,
    status: bk.status,
    retailTotal: retailByBooking.get(bk.id) ?? 0,
  }));
  const alreadyMatched = new Set((matchedToday ?? []).map((p) => p.booking_id as string));

  const match = matchPaymentToBooking({ amount, time }, forMatch, alreadyMatched);
  const base = { square_payment_id: payment.id, amount, paid_on: date, paid_time: time };

  if (match.status === 'matched') {
    const { error } = await sb.from('square_payments').insert({ ...base, booking_id: match.bookingId, match_status: 'matched' });
    if (error) return { result: 'skipped', message: error.message };
    await markBookingVisitedServer(sb, match.bookingId);
    return { result: 'matched', message: `${date} ${time} ¥${amount} の会計を予約に照らし合わせ、来店済みにしました` };
  }

  const note =
    match.status === 'needs_review'
      ? `同じ時間帯に当てはまる予約が${match.candidates.length}件あります`
      : '当てはまる予約が見つかりません（予約ボードにない来店・店販のみなど）';
  await sb.from('square_payments').insert({ ...base, match_status: 'needs_review', note });
  return { result: 'needs_review', message: `${date} ${time} ¥${amount}：${note}` };
}
