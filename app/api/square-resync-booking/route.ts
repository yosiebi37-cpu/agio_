import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resyncBookingToSquare } from '@/lib/square-sync';

/**
 * 予約ボードで予約の日時・メニュー・担当を変更したときに、Square側の予約も作り直す。
 * SQUARE_ACCESS_TOKENはサーバー側のみで使うため、クライアント（EditBookingModal）
 * からはこのAPI経由で呼び出す。
 */
export async function POST(request: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { bookingId?: string } | null;
  if (!body?.bookingId) {
    return NextResponse.json({ error: 'bookingIdが必要です。' }, { status: 400 });
  }

  try {
    const outcome = await resyncBookingToSquare(getServiceSupabase(), body.bookingId);
    return NextResponse.json({ ok: true, result: outcome.result, message: outcome.message ?? null });
  } catch {
    // 予約ボード側の変更はすでに保存済みなので、ここではSquare側の失敗だけを返す
    return NextResponse.json({ ok: true, result: 'failed' });
  }
}
