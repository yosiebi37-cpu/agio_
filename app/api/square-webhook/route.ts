import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import {
  verifySquareSignature,
  utcIsoToJst,
  isBookingCancelled,
  extractBooking,
  type SquareWebhookEvent,
} from '@/lib/square';
import { toMinutes, minutesToHHMM } from '@/lib/format';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';

async function fetchSquareCustomer(
  customerId: string,
  token: string,
): Promise<{ name: string; phone: string | null } | null> {
  const res = await fetch(`${SQUARE_API_BASE}/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Square-Version': SQUARE_API_VERSION },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const c = data.customer;
  if (!c) return null;
  const name = [c.family_name, c.given_name].filter(Boolean).join(' ') || c.company_name || 'Square予約(要確認)';
  return { name, phone: c.phone_number ?? null };
}

async function fetchSquareServiceVariation(
  id: string,
  token: string,
): Promise<{ name: string; price: number } | null> {
  const res = await fetch(`${SQUARE_API_BASE}/catalog/object/${id}`, {
    headers: { Authorization: `Bearer ${token}`, 'Square-Version': SQUARE_API_VERSION },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const variation = data.object?.item_variation_data;
  if (!variation) return null;
  return { name: variation.name || 'Square予約', price: variation.price_money?.amount ?? 0 };
}

/**
 * Square予約ページから直接入った予約を、agioへ取り込むWebhook。
 * agio→Square（HotPepper予約の登録・agioからのキャンセル）で作られた予約が
 * ここで再度取り込まれて上書き・二重登録にならないよう、source が既に
 * 'square' 以外（agio発）の予約は取り込み対象から除外する。
 */
export async function POST(request: Request) {
  const signingKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL;
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const rawBody = await request.text();

  if (!signingKey || !notificationUrl || !accessToken) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-square-hmacsha256-signature');
  if (!verifySquareSignature(rawBody, signature, notificationUrl, signingKey)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  const sb = getServiceSupabase();

  let payload: SquareWebhookEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await sb.from('square_sync_log').insert({ event_type: 'unknown', raw_body: rawBody, result: 'error', message: 'JSONの解析に失敗しました' });
    return NextResponse.json({ ok: true });
  }

  if (payload.type !== 'booking.created' && payload.type !== 'booking.updated') {
    await sb.from('square_sync_log').insert({ event_type: payload.type, raw_body: rawBody, result: 'skipped', message: '対象外のイベントです' });
    return NextResponse.json({ ok: true });
  }

  const booking = extractBooking(payload);
  if (!booking) {
    await sb.from('square_sync_log').insert({ event_type: payload.type, raw_body: rawBody, result: 'error', message: 'booking情報が見つかりません' });
    return NextResponse.json({ ok: true });
  }

  if (isBookingCancelled(booking.status)) {
    const { data: deleted } = await sb.from('bookings').delete().eq('square_booking_id', booking.id).eq('source', 'square').select('id');
    await sb.from('square_sync_log').insert({
      event_type: payload.type,
      raw_body: rawBody,
      result: deleted && deleted.length ? 'cancelled' : 'skipped',
      message: deleted && deleted.length
        ? `予約 ${booking.id} をキャンセルしました`
        : `予約 ${booking.id} は見つかりませんでした（すでに削除済み、未登録、またはagio発の予約）`,
    });
    return NextResponse.json({ ok: true });
  }

  // agioからSquareへ登録した予約（HotPepper予約など）が、ここで再度上書き取り込みされないようにする
  const { data: existing } = await sb.from('bookings').select('id,source').eq('square_booking_id', booking.id).maybeSingle();
  if (existing && existing.source !== 'square') {
    await sb.from('square_sync_log').insert({
      event_type: payload.type,
      raw_body: rawBody,
      result: 'skipped',
      message: `予約 ${booking.id} はagioから登録された予約のため、取り込みをスキップしました`,
    });
    return NextResponse.json({ ok: true });
  }

  const segment = booking.appointment_segments?.[0];
  if (!segment || !booking.start_at) {
    await sb.from('square_sync_log').insert({ event_type: payload.type, raw_body: rawBody, result: 'error', message: '予約の時間・メニュー情報が不足しています' });
    return NextResponse.json({ ok: true });
  }

  let staffId: string | null = null;
  if (segment.team_member_id) {
    const { data: staffRow } = await sb.from('staff').select('id').eq('square_team_member_id', segment.team_member_id).maybeSingle();
    staffId = staffRow?.id ?? null;
  }
  if (!staffId) {
    const { data: freeStaff } = await sb.from('staff').select('id').eq('name', 'フリー').maybeSingle();
    staffId = freeStaff?.id ?? null;
  }
  if (!staffId) {
    await sb.from('square_sync_log').insert({
      event_type: payload.type,
      raw_body: rawBody,
      result: 'error',
      message: '担当スタッフが見つかりませんでした。設定画面でスタッフのSquare担当者IDを登録するか、「フリー」というスタッフを作成してください。',
    });
    return NextResponse.json({ ok: true });
  }

  const { date, time } = utcIsoToJst(booking.start_at);
  const durationMinutes = segment.duration_minutes ?? 60;
  const endTime = minutesToHHMM(toMinutes(time) + durationMinutes);

  // agioで作った直後の予約は、Square側への登録が完了する前にこのWebhookが届くことがある
  // （square_booking_idがまだ入っていない）。その場合は新規登録せず、該当の予約に
  // square_booking_idを紐付けるだけにして、二重登録を防ぐ
  const { data: staffMatch } = await sb
    .from('bookings')
    .select('id')
    .eq('staff_id', staffId)
    .eq('booking_date', date)
    .eq('start_time', `${time}:00`)
    .is('square_booking_id', null)
    .neq('source', 'square')
    .maybeSingle();
  let pendingMatch = staffMatch;
  // Square側の会計操作などで担当スタイリストの情報が正しく送られず、上の一致判定が
  // 外れることがある。その場合でも、同じ日時に未連携の予約が1件だけなら（担当者が
  // 違っていても）それと同じ予約とみなして紐付ける（複数ある場合は誤って紐付けない）
  if (!pendingMatch) {
    const { data: timeMatches } = await sb
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('start_time', `${time}:00`)
      .is('square_booking_id', null)
      .neq('source', 'square')
      .limit(2);
    if (timeMatches && timeMatches.length === 1) {
      pendingMatch = timeMatches[0];
    }
  }
  if (pendingMatch) {
    const { error: linkError } = await sb.from('bookings').update({ square_booking_id: booking.id }).eq('id', pendingMatch.id);
    await sb.from('square_sync_log').insert({
      event_type: payload.type,
      raw_body: rawBody,
      result: linkError ? 'error' : 'skipped',
      message: linkError ? linkError.message : `予約 ${booking.id} はagioで作成中の予約と一致したため、紐付けのみ行いました`,
    });
    return NextResponse.json({ ok: true });
  }

  let customerName = 'Square予約(要確認)';
  let phone: string | null = null;
  if (booking.customer_id) {
    const customer = await fetchSquareCustomer(booking.customer_id, accessToken);
    if (customer) {
      customerName = customer.name;
      phone = customer.phone;
    }
  }

  let menuName = 'Square予約';
  let price = 0;
  if (segment.service_variation_id) {
    const variation = await fetchSquareServiceVariation(segment.service_variation_id, accessToken);
    if (variation) {
      menuName = variation.name;
      price = variation.price;
    }
  }

  const { error } = await sb.from('bookings').upsert(
    {
      square_booking_id: booking.id,
      source: 'square',
      customer_id: null,
      customer_name: customerName,
      staff_id: staffId,
      booking_date: date,
      start_time: `${time}:00`,
      end_time: `${endTime}:00`,
      menu: menuName,
      status: 'confirmed',
      customer_type: 'new',
      amount: price,
      note: phone ? `電話番号: ${phone}` : null,
    },
    { onConflict: 'square_booking_id' },
  );

  await sb.from('square_sync_log').insert({
    event_type: payload.type,
    raw_body: rawBody,
    result: error ? 'error' : 'created',
    message: error ? error.message : `予約 ${booking.id} を登録しました`,
  });
  return NextResponse.json({ ok: true });
}
