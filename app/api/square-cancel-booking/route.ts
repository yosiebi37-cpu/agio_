import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2024-01-18';

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

  if (squareBookingId && accessToken) {
    const getRes = await fetch(`${SQUARE_API_BASE}/bookings/${squareBookingId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_API_VERSION },
    });
    if (getRes.ok) {
      const getData = await getRes.json();
      const version = getData.booking?.version;
      const cancelRes = await fetch(`${SQUARE_API_BASE}/bookings/${squareBookingId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Square-Version': SQUARE_API_VERSION,
        },
        body: JSON.stringify({
          idempotency_key: `agio-cancel-${bookingId}`,
          booking_version: version,
        }),
      });
      if (!cancelRes.ok) {
        const cancelData = await cancelRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: `Squareでのキャンセルに失敗しました: ${JSON.stringify(cancelData)}` },
          { status: 502 },
        );
      }
    }
  }

  const { error: deleteError } = await sb.from('bookings').delete().eq('id', bookingId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
