import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { classifyHotpepperSubject, parseHotpepperBookingEmail, parseReservationId } from '@/lib/hotpepper';
import { toMinutes, minutesToHHMM } from '@/lib/format';
import {
  getSquareLocationId,
  createSquareCustomer,
  createSquareBooking,
  cancelSquareBookingById,
  jstToUtcIso,
} from '@/lib/square';

/**
 * HotPepper Beauty（SALON BOARD）の予約通知メールを、Zapier などのメール転送ツールから
 * 受け取って予約表へ反映する Webhook。{ subject, body } の JSON を受け取る想定。
 * メニュー・担当スタッフがSquare側と対応付けられていれば、Squareにも予約を作成する。
 */
export async function POST(request: Request) {
  const secret = request.headers.get('x-webhook-secret') ?? new URL(request.url).searchParams.get('secret');
  if (!process.env.HOTPEPPER_WEBHOOK_SECRET || secret !== process.env.HOTPEPPER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as { subject?: string; body?: string } | null;
  const subject = payload?.subject ?? '';
  const body = payload?.body ?? '';
  const sb = getServiceSupabase();
  const kind = classifyHotpepperSubject(subject);

  if (kind === 'booking') {
    const parsed = parseHotpepperBookingEmail(body);
    if (!parsed) {
      await sb.from('hotpepper_sync_log').insert({ subject, raw_body: body, result: 'error', message: '本文の解析に失敗しました' });
      return NextResponse.json({ ok: true });
    }

    let staffId: string | null = null;
    if (parsed.stylistName) {
      const { data: staffRow } = await sb.from('staff').select('id').eq('name', parsed.stylistName).maybeSingle();
      staffId = staffRow?.id ?? null;
    }
    if (!staffId) {
      const { data: freeStaff } = await sb.from('staff').select('id').eq('name', 'フリー').maybeSingle();
      staffId = freeStaff?.id ?? null;
    }
    if (!staffId) {
      await sb.from('hotpepper_sync_log').insert({
        subject,
        raw_body: body,
        result: 'error',
        message: `担当スタッフ「${parsed.stylistName ?? 'フリー'}」が見つかりませんでした。設定画面でスタッフを登録してください。`,
      });
      return NextResponse.json({ ok: true });
    }

    const endTime = minutesToHHMM(toMinutes(parsed.startTime) + parsed.durationMinutes);

    const { data: savedBooking, error } = await sb
      .from('bookings')
      .upsert(
        {
          hotpepper_reservation_id: parsed.reservationId,
          source: 'hotpepper',
          customer_id: null,
          customer_name: parsed.customerName,
          staff_id: staffId,
          booking_date: parsed.date,
          start_time: `${parsed.startTime}:00`,
          end_time: `${endTime}:00`,
          menu: parsed.menuName,
          status: 'confirmed',
          customer_type: 'new',
          amount: parsed.price,
          note: parsed.furigana ? `フリガナ: ${parsed.furigana}` : null,
        },
        { onConflict: 'hotpepper_reservation_id' },
      )
      .select('id')
      .single();

    if (error || !savedBooking) {
      await sb.from('hotpepper_sync_log').insert({
        subject,
        raw_body: body,
        result: 'error',
        message: error?.message ?? '予約の保存に失敗しました',
      });
      return NextResponse.json({ ok: true });
    }

    let squareMessage = '';
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    if (accessToken) {
      const { data: menuRow } = await sb
        .from('menu_items')
        .select('square_service_variation_id')
        .eq('name', parsed.menuName)
        .maybeSingle();
      const { data: staffRow } = await sb.from('staff').select('square_team_member_id').eq('id', staffId).maybeSingle();
      const serviceVariationId = menuRow?.square_service_variation_id as string | null | undefined;
      const teamMemberId = staffRow?.square_team_member_id as string | null | undefined;

      if (serviceVariationId && teamMemberId) {
        const locationId = await getSquareLocationId(accessToken);
        const customerId = locationId
          ? await createSquareCustomer(accessToken, parsed.customerName, `hp-customer-${parsed.reservationId}`)
          : null;
        const squareBookingId =
          locationId && customerId
            ? await createSquareBooking(accessToken, {
                locationId,
                customerId,
                teamMemberId,
                serviceVariationId,
                startAtIso: jstToUtcIso(parsed.date, parsed.startTime),
                durationMinutes: parsed.durationMinutes,
                idempotencyKey: `hp-square-${parsed.reservationId}`,
              })
            : null;
        if (squareBookingId) {
          await sb.from('bookings').update({ square_booking_id: squareBookingId }).eq('id', savedBooking.id);
          squareMessage = ' / Squareにも登録しました';
        } else {
          squareMessage = ' / Squareへの登録に失敗しました';
        }
      } else {
        squareMessage = ' / Square未連携（メニューまたは担当者のSquare IDが未設定）';
      }
    }

    await sb.from('hotpepper_sync_log').insert({
      subject,
      raw_body: body,
      result: 'created',
      message: `予約番号 ${parsed.reservationId} を登録しました${squareMessage}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (kind === 'cancel') {
    const reservationId = parseReservationId(body);
    if (!reservationId) {
      await sb.from('hotpepper_sync_log').insert({ subject, raw_body: body, result: 'error', message: '予約番号が見つかりませんでした' });
      return NextResponse.json({ ok: true });
    }
    const { data: deleted } = await sb
      .from('bookings')
      .delete()
      .eq('hotpepper_reservation_id', reservationId)
      .select('id,square_booking_id');

    let squareMessage = '';
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const squareBookingId = deleted?.[0]?.square_booking_id as string | null | undefined;
    if (accessToken && squareBookingId) {
      const ok = await cancelSquareBookingById(accessToken, squareBookingId);
      squareMessage = ok ? ' / Squareの予約もキャンセルしました' : ' / Square側のキャンセルに失敗しました';
    }

    await sb.from('hotpepper_sync_log').insert({
      subject,
      raw_body: body,
      result: deleted && deleted.length ? 'cancelled' : 'skipped',
      message:
        deleted && deleted.length
          ? `予約番号 ${reservationId} をキャンセルしました${squareMessage}`
          : `予約番号 ${reservationId} は見つかりませんでした（すでに削除済み、または未登録）`,
    });
    return NextResponse.json({ ok: true });
  }

  await sb.from('hotpepper_sync_log').insert({
    subject,
    raw_body: body,
    result: 'skipped',
    message: '件名が予約/キャンセルのパターンに一致しませんでした',
  });
  return NextResponse.json({ ok: true });
}
