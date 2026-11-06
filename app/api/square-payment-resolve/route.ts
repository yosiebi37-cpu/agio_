import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { markBookingVisitedServer } from '@/lib/square-payments';

/**
 * 予約ボードの「会計の要確認」で、よしこさんが選んだ結果を保存する。
 * bookingId を指定 → その予約の会計として記録し、来店済みにする
 * ignore: true → 予約とは関係ない会計として記録する（店販のみ・予約ボードにない来店など）
 */
export async function POST(request: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { paymentId?: string; bookingId?: string; ignore?: boolean } | null;
  if (!body?.paymentId || (!body.bookingId && !body.ignore)) {
    return NextResponse.json({ error: 'paymentId と bookingId（または ignore）が必要です。' }, { status: 400 });
  }

  const service = getServiceSupabase();
  if (body.ignore) {
    const { error } = await service.from('square_payments').update({ match_status: 'ignored' }).eq('id', body.paymentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await service
    .from('square_payments')
    .update({ match_status: 'matched', booking_id: body.bookingId })
    .eq('id', body.paymentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await markBookingVisitedServer(service, body.bookingId as string);
  return NextResponse.json({ ok: true });
}
