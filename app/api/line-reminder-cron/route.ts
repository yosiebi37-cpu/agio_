import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { toISODate, addDays, hhmm } from '@/lib/format';
import { sendLinePushMessage } from '@/lib/line';

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

    const text = `【ご予約のご案内】\n${booking.customer_name} 様\n\n明日 ${tomorrow} ${hhmm(booking.start_time)}〜のご予約をお待ちしております。\nメニュー：${booking.menu}\n\n※ご都合が悪くなった場合はお早めにご連絡ください。`;
    try {
      await sendLinePushMessage(customer.line_user_id, text, accessToken);
      sent += 1;
    } catch {
      // 個別の送信失敗はスキップし、他のお客様への送信は続ける
    }
    await sb.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', booking.id);
  }

  return NextResponse.json({ ok: true, sent, total: (bookings ?? []).length });
}
