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
    const { data: deleted } = await sb.from('bookings').delete().eq('square_booking_id', booking.id).select('id');
    await sb.from('square_sync_log').insert({
      event_type: payload.type,
      raw_body: rawBody,
      result: deleted && deleted.length ? 'cancelled' : 'skipped',
      message: deleted && deleted.length
        ? `予約 ${booking.id} をキャンセルしました`
        : `予約 ${booking.id} は見つかりませんでした（すでに削除済み、または未登録）`,
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

  const { date, time } = utcIsoToJst(booking.start_at);
  const durationMinutes = segment.duration_minutes ?? 60;
  const endTime = minutesToHHMM(toMinutes(time) + durationMinutes);

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
