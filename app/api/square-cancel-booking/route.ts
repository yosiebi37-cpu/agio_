import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { cancelSquareBookingById } from '@/lib/square';

export async function POST(request: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { bookingId } = (await request.json().catch(() => null)) as { bookingId?: string } | null ?? {};
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
  }

  const { data: booking, error: fetchError } = await sb
    .from('bookings')
    .select('square_booking_id')
    .eq('id', bookingId)
    .single();
  if (fetchError || !booking) {
    return NextResponse.json({ error: fetchError?.message ?? '予約が見つかりません' }, { status: 404 });
  }

  const squareBookingId = booking.square_booking_id as string | null;
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;

  // Square側のキャンセルに失敗しても、agio側の予約は削除できるようにする
  // （Squareのオンライン予約を停止済みのため、Square側の反映が失敗すること自体は許容する）
  let squareCancelFailed = false;
  if (squareBookingId && accessToken) {
    const ok = await cancelSquareBookingById(accessToken, squareBookingId);
    if (!ok) squareCancelFailed = true;
  }

  const { error: deleteError } = await sb.from('bookings').delete().eq('id', bookingId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, squareCancelFailed });
}

