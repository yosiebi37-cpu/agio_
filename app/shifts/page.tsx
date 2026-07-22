import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import ShiftClient from '@/components/ShiftClient';
import { toISODate, addDays, startOfWeek } from '@/lib/format';
import type { Staff, Shift } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? toISODate(new Date());
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);

  const sb = await getServerSupabase();
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
