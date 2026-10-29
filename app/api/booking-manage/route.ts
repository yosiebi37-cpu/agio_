import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { verifyLiffAccessToken, sendLinePushMessage } from '@/lib/line';
import { cancelSquareBookingById } from '@/lib/square';
import { syncBookingToSquare } from '@/lib/square-sync';
import {
  jstNow,
  canModifyBooking,
  computeAvailableStarts,
  filterFutureStarts,
  MODIFY_DEADLINE_HOUR,
  type ShiftRow,
  type TimeRange,
} from '@/lib/booking-manage';
import { toMinutes, minutesToHHMM, hhmm, formatDateLong } from '@/lib/format';

type Sb = ReturnType<typeof getServiceSupabase>;

interface ManageBody {
  accessToken?: string;
  action?: 'list' | 'slots' | 'cancel' | 'reschedule';
  bookingId?: string;
  date?: string;
  startTime?: string;
}

interface OwnBooking {
  id: string;
  customer_id: string;
  customer_name: string;
  staff_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  menu: string;
  amount: number;
  square_booking_id: string | null;
  source: string;
}

const BOOKING_COLUMNS = 'id,customer_id,customer_name,staff_id,booking_date,start_time,end_time,menu,amount,square_booking_id,source';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const deadlineMessage = `ご変更・キャンセルは、ご予約の前日の${MODIFY_DEADLINE_HOUR}時までにお願いしております。お手数ですが、店舗まで直接ご連絡ください。`;

async function loadStaffNames(sb: Sb, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await sb.from('staff').select('id,name').in('id', ids);
  return new Map((data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
}

/** 指定した日に、この予約（の担当・所要時間）で開始できる時刻の一覧 */
async function loadAvailableStarts(sb: Sb, booking: OwnBooking, date: string, nowMs: number): Promise<string[]> {
  const [{ data: settings }, { data: holiday }, { data: shift }, { data: shiftRows }, { data: dayBookings }, { data: capacityRows }, { data: staffList }] =
    await Promise.all([
      sb.from('salon_settings').select('closed_weekdays').eq('id', 1).maybeSingle(),
      sb.from('holidays').select('holiday_date').eq('holiday_date', date).maybeSingle(),
      sb.from('shifts').select('start_time,end_time').eq('staff_id', booking.staff_id).eq('shift_date', date).maybeSingle(),
      sb.from('shifts').select('staff_id,start_time,end_time').eq('shift_date', date),
      sb.from('bookings').select('id,staff_id,start_time,end_time').eq('booking_date', date),
      sb.from('hourly_capacity').select('hour,minute,capacity').eq('capacity_date', date),
      sb.from('staff').select('id,name').eq('is_active', true),
    ]);

  const closedWeekdays: number[] = settings?.closed_weekdays ?? [];
  const closed = Boolean(holiday) || closedWeekdays.includes(new Date(date + 'T00:00:00').getDay());

  // 日時を変更しようとしている予約自身は、埋まっているものとして数えない
  const others = ((dayBookings ?? []) as { id: string; staff_id: string; start_time: string; end_time: string }[]).filter(
    (b) => b.id !== booking.id,
  );
  const capacityOverrides = new Map<number, number>();
  for (const c of (capacityRows ?? []) as { hour: number; minute: number; capacity: number }[]) {
    capacityOverrides.set(c.hour * 60 + c.minute, c.capacity);
  }
  const freeStaffIds = new Set(
    ((staffList ?? []) as { id: string; name: string }[]).filter((s) => s.name === 'フリー').map((s) => s.id),
  );

  const starts = computeAvailableStarts({
    durationMinutes: toMinutes(booking.end_time) - toMinutes(booking.start_time),
    closed,
    shift: (shift as TimeRange | null) ?? null,
    staffBusy: others.filter((b) => b.staff_id === booking.staff_id),
    allBookings: others,
    capacityOverrides,
    allShifts: (shiftRows ?? []) as ShiftRow[],
    freeStaffIds,
  });
  return filterFutureStarts(starts, date, jstNow(nowMs));
}

/** よしこさん（オーナー）のLINEに、お客様からの変更・キャンセルを知らせる。失敗しても処理は止めない */
async function notifyOwner(text: string): Promise<void> {
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID?.trim();
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!ownerLineUserId || !token) return;
  try {
    await sendLinePushMessage(ownerLineUserId, text, token);
  } catch (e) {
    console.error('[booking-manage] owner LINE notify failed', e);
  }
}

/** お客様ご本人に、変更・キャンセルの内容をLINEで知らせる。失敗しても処理は止めない */
async function notifyCustomer(lineUserId: string, text: string): Promise<void> {
  const token = process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return;
  try {
    await sendLinePushMessage(lineUserId, text, token);
  } catch (e) {
    console.error('[booking-manage] customer LINE notify failed', e);
  }
}

/**
 * お客様向けの「予約の確認・日時変更・キャンセル」。
 * LINEのLIFFで取得したアクセストークンを検証し、そのLINEアカウントに紐づくお客様の予約だけを扱う。
 * 一覧にはこれからの予約をすべて表示し、変更・キャンセルできるのはagio（手入力・/book・/book/line）で作られた予約のみ。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ManageBody | null;
  if (!body?.accessToken || !body.action) return fail('リクエストの形式が正しくありません。', 400);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) return fail('LINEの設定が完了していません。店舗までご連絡ください。', 500);

  const lineUserId = await verifyLiffAccessToken(body.accessToken, liffId);
  if (!lineUserId) return fail('LINEでのログインを確認できませんでした。LINEアプリからもう一度開いてください。', 401);

  const sb = getServiceSupabase();
  const nowMs = Date.now();
  const today = jstNow(nowMs).date;

  const { data: customers } = await sb.from('customers').select('id').eq('line_user_id', lineUserId);
  const customerIds = (customers ?? []).map((c: { id: string }) => c.id);

  if (body.action === 'list') {
    if (customerIds.length === 0) {
      // まだLINEとお客様情報がつながっていない方（お店・電話・ホットペッパーで予約した方など）。
      // 画面で「連携申請」フォームを出すため、申請済み（スタッフの確認待ち）かどうかも返す
      const { data: pending } = await sb
        .from('line_link_requests')
        .select('id')
        .eq('line_user_id', lineUserId)
        .eq('status', 'pending')
        .limit(1);
      return NextResponse.json({ ok: true, linked: false, pendingRequest: (pending ?? []).length > 0, bookings: [] });
    }
    const { data } = await sb
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .in('customer_id', customerIds)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date')
      .order('start_time');
    const rows = (data ?? []) as OwnBooking[];
    const staffNames = await loadStaffNames(sb, Array.from(new Set(rows.map((b) => b.staff_id))));
    return NextResponse.json({
      ok: true,
      linked: true,
      deadlineHour: MODIFY_DEADLINE_HOUR,
      bookings: rows.map((b) => ({
        id: b.id,
        date: b.booking_date,
        startTime: hhmm(b.start_time),
        endTime: hhmm(b.end_time),
        menu: b.menu,
        staffName: staffNames.get(b.staff_id) ?? '',
        amount: b.amount,
        source: b.source,
        // ホットペッパー・Squareからの予約は表示だけ（変更・キャンセルはそれぞれのサービスか店舗で）
        modifiable: b.source === 'manual' && canModifyBooking(b.booking_date, nowMs),
      })),
    });
  }

  if (!body.bookingId || customerIds.length === 0) return fail('予約が見つかりません。', 404);
  const { data: found } = await sb
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', body.bookingId)
    .in('customer_id', customerIds)
    .eq('status', 'confirmed')
    .eq('source', 'manual')
    .maybeSingle();
  const booking = found as OwnBooking | null;
  if (!booking) return fail('予約が見つかりません。', 404);
  if (!canModifyBooking(booking.booking_date, nowMs)) return fail(deadlineMessage, 403);

  const staffName = (await loadStaffNames(sb, [booking.staff_id])).get(booking.staff_id) ?? '';
  const summary = `${booking.customer_name} 様\n${formatDateLong(booking.booking_date)} ${hhmm(booking.start_time)}〜\nメニュー：${booking.menu}\n担当：${staffName}`;

  if (body.action === 'slots') {
    if (!body.date || !DATE_RE.test(body.date)) return fail('日付が正しくありません。', 400);
    const starts = await loadAvailableStarts(sb, booking, body.date, nowMs);
    return NextResponse.json({ ok: true, starts });
  }

  if (body.action === 'cancel') {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    if (booking.square_booking_id && accessToken) {
      const ok = await cancelSquareBookingById(accessToken, booking.square_booking_id).catch(() => false);
      if (!ok) console.error('[booking-manage] Square cancel failed', booking.square_booking_id);
    }
    const { error } = await sb.from('bookings').delete().eq('id', booking.id);
    if (error) return fail('キャンセルに失敗しました。店舗までご連絡ください。', 500);

    await notifyOwner(`【予約キャンセル（お客様ご本人）】\n${summary}`);
    await notifyCustomer(lineUserId, `【ご予約をキャンセルしました】\n${summary}\n\nまたのご予約をお待ちしております。`);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reschedule') {
    if (!body.date || !DATE_RE.test(body.date) || !body.startTime || !TIME_RE.test(body.startTime)) {
      return fail('日時が正しくありません。', 400);
    }
    const starts = await loadAvailableStarts(sb, booking, body.date, nowMs);
    if (!starts.includes(body.startTime)) {
      return fail('この時間はすでに埋まってしまいました。別の時間をお選びください。', 409);
    }

    const duration = toMinutes(booking.end_time) - toMinutes(booking.start_time);
    const { error } = await sb
      .from('bookings')
      .update({
        booking_date: body.date,
        start_time: `${body.startTime}:00`,
        end_time: `${minutesToHHMM(toMinutes(body.startTime) + duration)}:00`,
        reminder_sent_at: null,
        square_booking_id: null,
      })
      .eq('id', booking.id);
    if (error) return fail('日時の変更に失敗しました。店舗までご連絡ください。', 500);

    // Square側は、古い予約を取り消して、新しい日時で登録し直す
    const squareToken = process.env.SQUARE_ACCESS_TOKEN;
    if (booking.square_booking_id && squareToken) {
      const ok = await cancelSquareBookingById(squareToken, booking.square_booking_id).catch(() => false);
      if (!ok) console.error('[booking-manage] Square cancel failed', booking.square_booking_id);
    }
    try {
      await syncBookingToSquare(sb, booking.id, `-r${nowMs}`);
    } catch (e) {
      console.error('[booking-manage] Square re-sync failed', e);
    }

    const after = `${booking.customer_name} 様\n${formatDateLong(body.date)} ${body.startTime}〜\nメニュー：${booking.menu}\n担当：${staffName}`;
    await notifyOwner(`【予約変更（お客様ご本人）】\n変更前：${formatDateLong(booking.booking_date)} ${hhmm(booking.start_time)}〜\n変更後：\n${after}`);
    await notifyCustomer(lineUserId, `【ご予約の日時を変更しました】\n${after}\n\nご来店をお待ちしております。`);
    return NextResponse.json({ ok: true });
  }

  return fail('リクエストの形式が正しくありません。', 400);
}
