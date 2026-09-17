import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import FreelanceClient, { type FreelanceRow } from '@/components/FreelanceClient';
import { toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function FreelancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { date: dateParam, view: viewParam, month: monthParam } = await searchParams;
  const sb = await getServerSupabase();
  if (await getCurrentStaff()) redirect('/board');

  const view: 'day' | 'month' = viewParam === 'month' ? 'month' : 'day';

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

  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { start, end } = view === 'month' ? monthRange(month) : { start: date, end: date };

  const { data: staffData } = await sb
    .from('staff')
    .select('*')
    .eq('employment_type', 'contract')
    .eq('is_active', true)
    .order('sort_order');
  const staff = (staffData ?? []) as Staff[];
  const ids = staff.map((s) => s.id);

  let bookings: { staff_id: string; customer_type: string; amount: number }[] = [];
  let retailSales: { staff_id: string | null; amount: number }[] = [];
  let manualSales: { staff_id: string; existing_amount: number; new_amount: number }[] = [];
  if (ids.length) {
    const [{ data: bookingData }, { data: retailData }, { data: manualData }] = await Promise.all([
      sb
        .from('bookings')
        .select('staff_id,customer_type,amount')
        .gte('booking_date', start)
        .lte('booking_date', end)
        .in('staff_id', ids),
      sb
        .from('retail_sales')
        .select('staff_id,amount')
        .gte('sale_date', start)
        .lte('sale_date', end)
        .in('staff_id', ids),
      sb
        .from('freelance_daily_sales')
        .select('staff_id,existing_amount,new_amount')
        .gte('sale_date', start)
        .lte('sale_date', end)
        .in('staff_id', ids),
    ]);
    bookings = (bookingData ?? []) as typeof bookings;
    retailSales = (retailData ?? []) as typeof retailSales;
    manualSales = (manualData ?? []) as typeof manualSales;
  }

  const rows: FreelanceRow[] = staff.map((s) => {
    const mine = bookings.filter((b) => b.staff_id === s.id);
    const myRetail = retailSales.filter((r) => r.staff_id === s.id);
    const myManual = manualSales.filter((m) => m.staff_id === s.id);
    return {
      id: s.id,
      name: s.name,
      initials: s.initials,
      bg: s.bg_color,
      fg: s.fg_color,
      count: mine.length,
      bookingEx: mine.filter((b) => b.customer_type === 'existing').reduce((sum, b) => sum + (b.amount ?? 0), 0),
      bookingNw: mine.filter((b) => b.customer_type === 'new').reduce((sum, b) => sum + (b.amount ?? 0), 0),
      manualEx: myManual.reduce((sum, m) => sum + (m.existing_amount ?? 0), 0),
      manualNw: myManual.reduce((sum, m) => sum + (m.new_amount ?? 0), 0),
      retailSales: myRetail.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    };
  });

  const { data: settings } = await sb
    .from('commission_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  return (
    <FreelanceClient
      rows={rows}
      date={date}
      view={view}
      month={month}
      initialExRate={settings?.existing_rate ?? 60}
      initialNwRate={settings?.new_rate ?? 50}
      initialRetailRate={settings?.retail_rate ?? 20}
    />
  );
}
