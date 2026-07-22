import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import BoardClient from '@/components/BoardClient';
import BoardWeekView from '@/components/BoardWeekView';
import BoardMonthView from '@/components/BoardMonthView';
import { toISODate, addDays, startOfWeek } from '@/lib/format';
import type { Staff, BookingWithStaff, SalonSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ViewMode = 'day' | 'week' | 'month';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { date: dateParam, view: viewParam } = await searchParams;
  const view: ViewMode = viewParam === 'week' || viewParam === 'month' ? viewParam : 'day';
  const sb = await getServerSupabase();

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

  if (view === 'week') {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    const [{ data: staffData }, { data: bookingData }] = await Promise.all([
      sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
      sb
        .from('bookings')
        .select('booking_date,staff_id,amount,status')
        .gte('booking_date', start)
        .lte('booking_date', end),
    ]);
    return (
      <BoardWeekView
        staff={(staffData ?? []) as Staff[]}
        bookings={(bookingData ?? []) as { booking_date: string; staff_id: string; amount: number; status: string }[]}
        date={date}
        weekStart={start}
      />
    );
  }

  if (view === 'month') {
    const [y, m] = date.split('-').map(Number);
    const start = toISODate(new Date(y, m - 1, 1));
    const end = toISODate(new Date(y, m, 0));
    const [{ data: bookingData }, { data: salonSettingsData }, { data: holidayData }] = await Promise.all([
      sb.from('bookings').select('booking_date,amount,status').gte('booking_date', start).lte('booking_date', end),
      sb.from('salon_settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('holidays').select('holiday_date').gte('holiday_date', start).lte('holiday_date', end),
    ]);
    const salonSettings = (salonSettingsData as SalonSettings | null) ?? { id: 1, closed_weekdays: [], updated_at: '' };
    return (
      <BoardMonthView
        bookings={(bookingData ?? []) as { booking_date: string; amount: number; status: string }[]}
        date={date}
        closedWeekdays={salonSettings.closed_weekdays}
        holidayDates={(holidayData ?? []).map((h) => h.holiday_date as string)}
      />
    );
  }

  const [{ data: staffData }, { data: bookingData }, { data: salonSettingsData }, { data: holidayRow }] = await Promise.all([
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
    sb
      .from('bookings')
      .select('*, staff:staff_id(name,color,employment_type)')
      .eq('booking_date', date)
      .order('start_time'),
    sb.from('salon_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('holidays').select('holiday_date,note').eq('holiday_date', date).maybeSingle(),
  ]);

  const staff = (staffData ?? []) as Staff[];
  const bookings = (bookingData ?? []) as unknown as BookingWithStaff[];
  const salonSettings = (salonSettingsData as SalonSettings | null) ?? { id: 1, closed_weekdays: [], updated_at: '' };
  const isWeeklyClosed = salonSettings.closed_weekdays.includes(new Date(date + 'T00:00:00').getDay());
  const holidayNote = holidayRow ? ((holidayRow as { note: string | null }).note ?? '休業日') : null;
  const closedLabel = holidayNote ?? (isWeeklyClosed ? '定休日' : null);

  return <BoardClient staff={staff} bookings={bookings} date={date} closedLabel={closedLabel} />;
}
