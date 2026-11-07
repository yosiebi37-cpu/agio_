import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { toISODate, addDays, hhmm } from '@/lib/format';
import { sendLinePushMessage, manageBookingUrl, lineBookingUrl } from '@/lib/line';
import {
  type FollowupKind,
  FOLLOWUP_SENT_COLUMN,
  visitDateFor,
  shouldSendFollowup,
  buildFollowupMessage,
} from '@/lib/line-followup';

/**
 * 毎日決まった時刻にVercel Cronから呼び出され、明日の予約のお客様（LINEユーザーIDが
 * わかっている人のみ）にリマインダーメッセージを送る。CRON_SECRETで認証する。
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const accessToken = process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN not set' });
  }

  const manageUrl = manageBookingUrl();
  const sb = getServiceSupabase();
  const tomorrow = addDays(toISODate(new Date()), 1);

  const { data: bookings } = await sb
    .from('bookings')
    .select('id,customer_id,customer_name,start_time,menu')
    .eq('booking_date', tomorrow)
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null);

  let sent = 0;
  for (const booking of bookings ?? []) {
    if (!booking.customer_id) continue;
    const { data: customer } = await sb
      .from('customers')
      .select('line_user_id')
      .eq('id', booking.customer_id)
      .maybeSingle();
    if (!customer?.line_user_id) continue;

    const text = `【ご予約のご案内】\n${booking.customer_name} 様\n\n明日 ${tomorrow} ${hhmm(booking.start_time)}〜のご予約をお待ちしております。\nメニュー：${booking.menu}\n\n※ご都合が悪くなった場合はお早めにご連絡ください。${manageUrl ? `\n\n▼ご予約の確認・日時変更・キャンセルはこちら\n${manageUrl}` : ''}`;
    try {
      await sendLinePushMessage(customer.line_user_id, text, accessToken);
      sent += 1;
    } catch (e) {
      // 個別の送信失敗はスキップし、他のお客様への送信は続ける（原因調査のためログだけ残す）
      console.error('[line-reminder-cron] push failed', booking.id, e);
    }
    await sb.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', booking.id);
  }

  // 来店後のメッセージ（来店翌日のお礼・45日後・90日後のご案内）
  const followups = await sendVisitFollowups(sb, accessToken);

  return NextResponse.json({ ok: true, sent, total: (bookings ?? []).length, followups });
}

async function sendVisitFollowups(
  sb: ReturnType<typeof getServiceSupabase>,
  accessToken: string,
): Promise<Record<FollowupKind, number> | { skipped: string }> {
  const today = toISODate(new Date());
  const bookingUrl = lineBookingUrl();
  const result: Record<FollowupKind, number> = { thanks: 0, followup45: 0, followup90: 0 };

  for (const kind of ['thanks', 'followup45', 'followup90'] as FollowupKind[]) {
    const visitDate = visitDateFor(kind, today);
    const sentColumn = FOLLOWUP_SENT_COLUMN[kind];
    const { data: visited, error } = await sb
      .from('bookings')
      .select('id,customer_id,customer_name,booking_date')
      .eq('booking_date', visitDate)
      .eq('status', 'visited')
      .is(sentColumn, null);
    // 送信済みを記録する列がまだ無い（SQL未実行）の時は、二重送信を防ぐため何も送らない
    if (error) return { skipped: error.message };

    for (const booking of visited ?? []) {
      if (!booking.customer_id) continue;
      const { data: customer } = await sb
        .from('customers')
        .select('line_user_id')
        .eq('id', booking.customer_id)
        .maybeSingle();
      if (!customer?.line_user_id) continue;

      if (kind !== 'thanks') {
        const { data: others } = await sb
          .from('bookings')
          .select('booking_date,status')
          .eq('customer_id', booking.customer_id)
          .neq('id', booking.id);
        if (!shouldSendFollowup(booking.booking_date, others ?? [])) {
          // 次の予約・再来店がある方には送らない（毎日判定し直さないよう、記録だけ残す）
          await sb.from('bookings').update({ [sentColumn]: new Date().toISOString() }).eq('id', booking.id);
          continue;
        }
      }

      try {
        await sendLinePushMessage(customer.line_user_id, buildFollowupMessage(kind, booking.customer_name, bookingUrl), accessToken);
        result[kind] += 1;
      } catch (e) {
        console.error('[line-reminder-cron] followup push failed', kind, booking.id, e);
      }
      await sb.from('bookings').update({ [sentColumn]: new Date().toISOString() }).eq('id', booking.id);
    }
  }
  return result;
}
