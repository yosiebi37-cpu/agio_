import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSquareLocationId,
  createSquareCustomerDetailed,
  createSquareBookingDetailed,
  cancelSquareBookingById,
  jstToUtcIso,
} from '@/lib/square';
import { hhmm, toMinutes } from '@/lib/format';

/**
 * Squareとの同期結果。
 * - synced: Squareに登録した
 * - already: すでにSquareに登録済み（何もしていない）
 * - not_configured: SquareのアクセストークンやメニューID・スタッフIDが未設定で、対象外
 * - failed: Squareとの通信に失敗した
 */
export type SquareSyncResult = 'synced' | 'already' | 'not_configured' | 'failed';

export interface SquareSyncOutcome {
  result: SquareSyncResult;
  /** 失敗・対象外の理由（画面のお知らせ用） */
  message?: string;
}

async function logSyncError(sb: SupabaseClient, bookingId: string, message: string): Promise<void> {
  await sb
    .from('square_sync_log')
    .insert({ event_type: 'agio.sync', raw_body: bookingId, result: 'error', message })
    .then(
      () => undefined,
      () => undefined,
    );
}

interface MenuSquareRow {
  name: string;
  square_service_variation_id: string | null;
  price?: number | null;
}

/**
 * 予約のメニュー文字列から、Squareのサービスを選ぶ。
 * 複数メニューの予約は「メニューA＋メニューB」のように＋でつながっているが、
 * メニュー名そのものにも＋が含まれる（例：カット＋カラー）ため、単純に＋で分割はできない。
 * そこで、①完全一致 → ②先頭から一致する一番長いメニュー名（＝1つ目のメニュー）の順に探す。
 * 「LINE限定」と「一般」で同じ名前のメニューがある時は、予約の金額と同じ値段のメニューを優先する。
 */
export function pickSquareServiceForMenu(menu: string, items: MenuSquareRow[], amount?: number | null): string | null {
  const target = menu.trim();
  const withId = items.filter((m) => m.square_service_variation_id && m.name.trim());
  const choose = (cands: MenuSquareRow[]): string | null => {
    if (!cands.length) return null;
    const samePrice = amount != null ? cands.find((m) => m.price != null && m.price === amount) : undefined;
    return (samePrice ?? cands[0]).square_service_variation_id;
  };
  const exact = withId.filter((m) => m.name.trim() === target);
  if (exact.length) return choose(exact);
  const prefixMatches = withId.filter((m) => target.startsWith(`${m.name.trim()}＋`));
  if (!prefixMatches.length) return null;
  const longest = Math.max(...prefixMatches.map((m) => m.name.trim().length));
  return choose(prefixMatches.filter((m) => m.name.trim().length === longest));
}

/**
 * agioで登録された予約（手入力・/book・/book/line経由）を、Square側にも登録する。
 * メニュー名・担当スタッフがSquare側と紐付いている場合のみ登録できる。
 * すでにsquare_booking_idが付いている予約（Square発の予約や登録済みの予約）は対象外。
 */
export async function syncBookingToSquare(
  sb: SupabaseClient,
  bookingId: string,
  idempotencySuffix = '',
): Promise<SquareSyncOutcome> {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) return { result: 'not_configured', message: 'SquareのアクセストークンがVercelに設定されていません' };

  const { data: booking } = await sb
    .from('bookings')
    .select('id,customer_name,staff_id,booking_date,start_time,end_time,menu,amount,square_booking_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return { result: 'failed', message: '予約が見つかりません' };
  if (booking.square_booking_id) return { result: 'already' };

  const [{ data: menuRows }, { data: staffRow }] = await Promise.all([
    sb.from('menu_items').select('name,square_service_variation_id,price').not('square_service_variation_id', 'is', null),
    sb.from('staff').select('square_team_member_id').eq('id', booking.staff_id).maybeSingle(),
  ]);
  const serviceVariationId = pickSquareServiceForMenu(
    booking.menu ?? '',
    (menuRows ?? []) as MenuSquareRow[],
    booking.amount as number | null | undefined,
  );
  const teamMemberId = staffRow?.square_team_member_id as string | null | undefined;
  if (!serviceVariationId) return { result: 'not_configured', message: 'メニューにSquare IDが設定されていません' };
  if (!teamMemberId) return { result: 'not_configured', message: '担当スタッフにSquare担当者IDが設定されていません' };

  const fail = async (message: string): Promise<SquareSyncOutcome> => {
    await logSyncError(sb, booking.id, message);
    return { result: 'failed', message };
  };

  const locationId = await getSquareLocationId(accessToken);
  if (!locationId) return fail('Squareの店舗情報を取得できませんでした');
  const customer = await createSquareCustomerDetailed(
    accessToken,
    booking.customer_name,
    `agio-customer-${booking.id}`,
  );
  if (!customer.id) return fail(customer.error ?? 'お客様の登録に失敗しました');
  const customerId = customer.id;

  const durationMinutes = toMinutes(booking.end_time) - toMinutes(booking.start_time);
  const created = await createSquareBookingDetailed(accessToken, {
    locationId,
    customerId,
    teamMemberId,
    serviceVariationId,
    startAtIso: jstToUtcIso(booking.booking_date, hhmm(booking.start_time)),
    durationMinutes,
    // 日時変更でSquareの予約を作り直す時は、前回と同じキーだと取り消し済みの予約が返ってくるため、別のキーを渡す
    idempotencyKey: `agio-square-${booking.id}${idempotencySuffix}`,
  });
  if (!created.id) return fail(created.error ?? '予約の登録に失敗しました');
  await sb.from('bookings').update({ square_booking_id: created.id }).eq('id', booking.id);
  return { result: 'synced' };
}

/**
 * 予約ボードで日時・メニュー・担当を変更したあとに呼ぶ。
 * Square側の古い予約を取り消してから、変更後の内容でSquareに登録し直す。
 * 古い予約の取り消しに失敗した場合は、Squareに予約が二重にできないよう、作り直しはしない。
 */
export async function resyncBookingToSquare(sb: SupabaseClient, bookingId: string): Promise<SquareSyncOutcome> {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) return { result: 'not_configured', message: 'SquareのアクセストークンがVercelに設定されていません' };

  const { data: booking } = await sb
    .from('bookings')
    .select('id,square_booking_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return { result: 'failed', message: '予約が見つかりません' };

  const oldSquareBookingId = booking.square_booking_id as string | null;
  if (oldSquareBookingId) {
    // 先に紐付けを外してから取り消す。取り消しのWebhook（square-webhook）が先に届いても、
    // この予約（Square発の予約の場合も）を「取り消された予約」と誤って削除しないようにするため
    await sb.from('bookings').update({ square_booking_id: null }).eq('id', bookingId);
    const cancelled = await cancelSquareBookingById(accessToken, oldSquareBookingId).catch(() => false);
    if (!cancelled) {
      // 取り消せなかった時は紐付けを元に戻し、Squareに予約が二重にできないよう作り直しはしない
      await sb.from('bookings').update({ square_booking_id: oldSquareBookingId }).eq('id', bookingId);
      const message = 'Square側の古い予約を取り消せませんでした';
      await logSyncError(sb, bookingId, message);
      return { result: 'failed', message };
    }
  }

  // 同じキーだと取り消し済みの予約が返ってくるため、作り直すたびに別のキーにする
  return syncBookingToSquare(sb, bookingId, `-edit-${Date.now()}`);
}
