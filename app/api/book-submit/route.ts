import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { toMinutes, minutesToHHMM, initialsFromName } from '@/lib/format';
import { sendLinePushMessage } from '@/lib/line';

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 20 * 60;

interface BookSubmitBody {
  idempotencyKey: string;
  menuName: string;
  menuDurationMinutes: number;
  menuPrice: number;
  staffId: string;
  date: string;
  startTime: string;
  lastName: string;
  firstName: string;
  furigana: string;
  phone: string;
  memo: string;
}

/**
 * お客様向け予約ページ（/book, /book/line）の確定処理。
 * クライアントから直接Supabaseにinsertしていたものをサーバー側に集約し、
 * 確定の瞬間にもう一度「空き」を検証してから予約を作成する（二重予約防止）。
 * idempotencyKey が同じリクエストが再送されても、二重に予約を作らない。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as BookSubmitBody | null;
  if (!body) {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 });
  }
  const { idempotencyKey, menuName, menuDurationMinutes, menuPrice, staffId, date, startTime, lastName, firstName, furigana, phone, memo } = body;

  const name = `${(lastName ?? '').trim()} ${(firstName ?? '').trim()}`.trim();
  if (!idempotencyKey || !menuName || !staffId || !date || !startTime || !name || !phone?.trim()) {
    return NextResponse.json({ error: '必要な項目が入力されていません。' }, { status: 400 });
  }

  const sb = getServiceSupabase();

  // 同じ確定操作の再送であれば、新しく作らずそのまま成功として返す
  const { data: existing } = await sb
    .from('bookings')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, bookingId: existing.id, alreadyExists: true });
  }

  // 定休日・休業日チェック
  const [{ data: salonSettings }, { data: holiday }] = await Promise.all([
    sb.from('salon_settings').select('closed_weekdays').eq('id', 1).maybeSingle(),
    sb.from('holidays').select('holiday_date').eq('holiday_date', date).maybeSingle(),
  ]);
  const closedWeekdays: number[] = salonSettings?.closed_weekdays ?? [];
  if (holiday || closedWeekdays.includes(new Date(date + 'T00:00:00').getDay())) {
    return NextResponse.json({ error: 'この日は定休日のため予約できません。別の日をお選びください。' }, { status: 409 });
  }

  // シフト（出勤日・出勤時間）チェック
  const { data: shift } = await sb
    .from('shifts')
    .select('start_time,end_time')
    .eq('staff_id', staffId)
    .eq('shift_date', date)
    .maybeSingle();
  if (!shift) {
    return NextResponse.json({ error: 'この日は担当スタッフの出勤日ではありません。別の日時をお選びください。' }, { status: 409 });
  }

  const duration = menuDurationMinutes && menuDurationMinutes > 0 ? menuDurationMinutes : 60;
  const startMin = toMinutes(startTime);
  const endMin = startMin + duration;
  const shiftStart = Math.max(OPEN_MIN, toMinutes(shift.start_time));
  const shiftEnd = Math.min(CLOSE_MIN, toMinutes(shift.end_time));
  if (startMin < shiftStart || endMin > shiftEnd) {
    return NextResponse.json({ error: 'この時間は担当スタッフの出勤時間外です。別の時間をお選びください。' }, { status: 409 });
  }

  // 指名したスタッフの二重予約チェック
  const { data: staffBookings } = await sb
    .from('bookings')
    .select('start_time,end_time')
    .eq('staff_id', staffId)
    .eq('booking_date', date);
  const staffOverlap = (staffBookings ?? []).some(
    (b: { start_time: string; end_time: string }) => toMinutes(b.start_time) < endMin && toMinutes(b.end_time) > startMin,
  );
  if (staffOverlap) {
    return NextResponse.json({ error: 'この時間はすでに埋まってしまいました。別の時間をお選びください。' }, { status: 409 });
  }

  // お店全体の受付可能数チェック（残り受付可能数、30分単位）
  const [{ data: allBookings }, { data: capacityRows }, { data: staffList }, { data: shiftRows }] = await Promise.all([
    sb.from('bookings').select('start_time,end_time').eq('booking_date', date),
    sb.from('hourly_capacity').select('hour,minute,capacity').eq('capacity_date', date),
    sb.from('staff').select('id,name').eq('is_active', true),
    sb.from('shifts').select('staff_id,start_time,end_time').eq('shift_date', date),
  ]);
  const freeStaffIds = new Set((staffList ?? []).filter((s: { name: string }) => s.name === 'フリー').map((s: { id: string }) => s.id));
  const shifts = (shiftRows ?? []) as { staff_id: string; start_time: string; end_time: string }[];
  const capacityMap = new Map<number, number>();
  for (const c of (capacityRows ?? []) as { hour: number; minute: number; capacity: number }[]) capacityMap.set(c.hour * 60 + c.minute, c.capacity);
  // 誰もシフトに入っていない時間は0になる（＝その時間はどのスタッフも選べず、実際に予約もできない）
  const shiftBookableCount = (bStart: number, bEnd: number) => {
    const workingIds = new Set(
      shifts
        .filter((sh) => !freeStaffIds.has(sh.staff_id) && toMinutes(sh.start_time) <= bStart && toMinutes(sh.end_time) >= bEnd)
        .map((sh) => sh.staff_id),
    );
    return workingIds.size;
  };
  const firstBucket = Math.floor(startMin / 30) * 30;
  const lastBucket = Math.floor((endMin - 1) / 30) * 30;
  for (let bStart = firstBucket; bStart <= lastBucket; bStart += 30) {
    const bEnd = bStart + 30;
    const count = (allBookings ?? []).filter(
      (b: { start_time: string; end_time: string }) => toMinutes(b.start_time) < bEnd && toMinutes(b.end_time) > bStart,
    ).length;
    const capacity = capacityMap.get(bStart) ?? shiftBookableCount(bStart, bEnd);
    if (count >= capacity) {
      return NextResponse.json({ error: 'この時間帯は受付上限に達しました。別の時間をお選びください。' }, { status: 409 });
    }
  }

  // お客様の解決（電話番号で既存客を検索、無ければ新規作成）
  let customerId: string;
  let customerType: 'existing' | 'new' = 'new';
  const { data: foundCustomer } = await sb
    .from('customers')
    .select('id,customer_type')
    .eq('phone', phone.trim())
    .maybeSingle();
  if (foundCustomer) {
    customerId = foundCustomer.id;
    customerType = foundCustomer.customer_type;
  } else {
    const { data: newCustomer, error: customerError } = await sb
      .from('customers')
      .insert({
        name,
        furigana: furigana?.trim() || null,
        phone: phone.trim(),
        initials: initialsFromName(name),
        customer_type: 'new',
      })
      .select('id')
      .single();
    if (customerError || !newCustomer) {
      return NextResponse.json({ error: customerError?.message ?? 'お客様情報の登録に失敗しました。' }, { status: 500 });
    }
    customerId = newCustomer.id;
  }

  const { data: booking, error: bookingError } = await sb
    .from('bookings')
    .insert({
      customer_id: customerId,
      customer_name: name,
      staff_id: staffId,
      booking_date: date,
      start_time: `${startTime}:00`,
      end_time: `${minutesToHHMM(endMin)}:00`,
      menu: menuName,
      status: 'confirmed',
      customer_type: customerType,
      amount: menuPrice ?? 0,
      note: memo?.trim() || null,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();
  if (bookingError || !booking) {
    // 同時押しでidempotency_keyがユニーク制約に引っかかった場合も、成功扱いにする
    if (bookingError?.code === '23505') {
      const { data: retry } = await sb.from('bookings').select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
      if (retry) return NextResponse.json({ ok: true, bookingId: retry.id, alreadyExists: true });
    }
    return NextResponse.json({ error: bookingError?.message ?? '予約の登録に失敗しました。' }, { status: 500 });
  }

  // 新しい予約が入ったことをオーナーのLINEに通知する（未設定の場合は何もしない。
  // 通知に失敗しても、お客様への予約完了レスポンスには影響させない）
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID?.trim();
  const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (ownerLineUserId && lineAccessToken) {
    const staffName = (staffList ?? []).find((s: { id: string; name: string }) => s.id === staffId)?.name ?? '';
    const notifyText = `【新しい予約】\n${name} 様\n${date} ${startTime}〜\n${menuName}\n担当：${staffName}`;
    try {
      await sendLinePushMessage(ownerLineUserId, notifyText, lineAccessToken);
    } catch {
      // 通知の失敗は無視する（予約自体は成立している）
    }
  }

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
