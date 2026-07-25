import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import ShiftClient from '@/components/ShiftClient';
import ShiftMonthView from '@/components/ShiftMonthView';
import { toISODate, addDays, startOfWeek } from '@/lib/format';
import type { Staff, Shift } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { date: dateParam, view: viewParam } = await searchParams;
  const date = dateParam ?? toISODate(new Date());
  const sb = await getServerSupabase();

  if (viewParam === 'month') {
    const [y, m] = date.split('-').map(Number);
    const start = toISODate(new Date(y, m - 1, 1));
    const end = toISODate(new Date(y, m, 0));
    const [{ data: staffData }, { data: shiftData }] = await Promise.all([
      sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
      sb.from('shifts').select('*').gte('shift_date', start).lte('shift_date', end),
    ]);
    return (
      <ShiftMonthView
        staff={(staffData ?? []) as Staff[]}
        shifts={(shiftData ?? []) as Shift[]}
        date={date}
      />
    );
  }

  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const [{ data: staffData }, { data: shiftData }] = await Promise.all([
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
    sb
      .from('shifts')
      .select('*')
      .gte('shift_date', weekStart)
      .lte('shift_date', weekEnd),
  ]);

  return (
    <ShiftClient
      staff={(staffData ?? []) as Staff[]}
      shifts={(shiftData ?? []) as Shift[]}
      weekStart={weekStart}
    />
  );
}
