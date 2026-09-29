import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { syncBookingToSquare } from '@/lib/square-sync';

/**
 * 予約ボードで手入力した予約を、Squareにも登録する。
 * SQUARE_ACCESS_TOKENはサーバー側のみで使うため、クライアント（NewBookingModal）
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
    await syncBookingToSquare(getServiceSupabase(), body.bookingId);
  } catch {
    // Square連携の失敗はここで飲み込む（呼び出し元は予約作成自体は成功している）
  }

  return NextResponse.json({ ok: true });
}
