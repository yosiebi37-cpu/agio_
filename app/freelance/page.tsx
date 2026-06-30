import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import FreelanceClient, { type FreelanceRow } from '@/components/FreelanceClient';
import { toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function FreelancePage({
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

  const { data: staffData } = await sb
    .from('staff')
    .select('*')
    .eq('employment_type', 'contract')
    .eq('is_active', true)
    .order('sort_order');
  const staff = (staffData ?? []) as Staff[];
  const ids = staff.map((s) => s.id);

  let bookings: { staff_id: string; customer_type: string; amount: number; customer_id: string | null }[] = [];
  if (ids.length) {
    const { data } = await sb
      .from('bookings')
      .select('staff_id,customer_type,amount,customer_id')
      .eq('booking_date', date)
      .in('staff_id', ids);
    bookings = (data ?? []) as typeof bookings;
  }

  const rows: FreelanceRow[] = staff.map((s) => {
    const mine = bookings.filter((b) => b.staff_id === s.id);
    const exSales  = mine.filter((b) => b.customer_type === 'existing').reduce((sum, b) => sum + (b.amount ?? 0), 0);
    // 新規客 = customer_id あり、フリー客 = customer_id なし（どちらも50%）
    const nwSales  = mine.filter((b) => b.customer_type === 'new' && b.customer_id != null).reduce((sum, b) => sum + (b.amount ?? 0), 0);
    const frSales  = mine.filter((b) => b.customer_type === 'new' && b.customer_id == null).reduce((sum, b) => sum + (b.amount ?? 0), 0);
    const count    = mine.length;
    const total    = exSales + nwSales + frSales;
    return {
      id: s.id,
      name: s.name,
      initials: s.initials,
      bg: s.bg_color,
      fg: s.fg_color,
      count,
      exSales,
      nwSales,
      frSales,
      avgSpend: count > 0 ? Math.round(total / count) : 0,
    };
  });

  return (
    <FreelanceClient
      rows={rows}
      date={date}
    />
  );
}
