import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SalesClient, { type DailyRow } from '@/components/SalesClient';
import { toISODate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { month: monthParam } = await searchParams;
  const sb = getServerSupabase();

  let month: string;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    month = monthParam;
  } else {
    const { data: latest } = await sb
      .from('bookings')
      .select('booking_date')
      .order('booking_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ref = latest?.booking_date
      ? new Date((latest.booking_date as string) + 'T00:00:00')
      : new Date();
    const mm = String(ref.getMonth() + 1).padStart(2, '0');
    month = `${ref.getFullYear()}-${mm}`;
  }

  const [y, m] = month.split('-').map(Number);
  const firstDay = `${month}-01`;
  const lastDay = toISODate(new Date(y, m, 0)); // last day of month

  const { data } = await sb
    .from('bookings')
    .select('booking_date,amount')
    .gte('booking_date', firstDay)
    .lte('booking_date', lastDay)
    .order('booking_date');

  const bookings = (data ?? []) as { booking_date: string; amount: number }[];

  // Aggregate by date
  const map = new Map<string, { count: number; sales: number }>();
  for (const b of bookings) {
    const existing = map.get(b.booking_date) ?? { count: 0, sales: 0 };
    map.set(b.booking_date, { count: existing.count + 1, sales: existing.sales + (b.amount ?? 0) });
  }

  const rows: DailyRow[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { count, sales }]) => ({ date, count, sales }));

  return <SalesClient month={month} rows={rows} />;
}
