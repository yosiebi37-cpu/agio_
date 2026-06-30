import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import BoardClient from '@/components/BoardClient';
import { toISODate } from '@/lib/format';
import type { Staff, BookingWithStaff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { date: dateParam } = await searchParams;
  const sb = getServerSupabase();

  let date: string;
  if (dateParam) {
    date = dateParam;
  } else {
    const { data: latest } = await sb
      .from('bookings')
      .select('booking_date')
      .order('booking_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    date = (latest?.booking_date as string | null) ?? toISODate(new Date());
  }

  const [{ data: staffData }, { data: bookingData }] = await Promise.all([
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
    sb
      .from('bookings')
      .select('*, staff:staff_id(name,color,employment_type)')
      .eq('booking_date', date)
      .order('start_time'),
  ]);

  const staff = (staffData ?? []) as Staff[];
  const bookings = (bookingData ?? []) as unknown as BookingWithStaff[];

  return <BoardClient staff={staff} bookings={bookings} date={date} />;
}
