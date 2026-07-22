import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SalesClient from '@/components/SalesClient';
import { toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(month);

  const sb = await getServerSupabase();
  const [{ data: bookingsData }, { data: staffData }] = await Promise.all([
    sb
      .from('bookings')
      .select('booking_date,staff_id,amount,status,customer_type')
      .gte('booking_date', start)
      .lte('booking_date', end),
    sb.from('staff').select('*').order('sort_order'),
  ]);

  return (
    <SalesClient
      month={month}
      bookings={(bookingsData ?? []) as { booking_date: string; staff_id: string; amount: number; status: string; customer_type: string }[]}
      staff={(staffData ?? []) as Staff[]}
    />
  );
}
