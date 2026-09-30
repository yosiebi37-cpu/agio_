import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import FreelanceClient, { type FreelanceRow, type FreelanceDailyRow } from '@/components/FreelanceClient';
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

  let bookings: { staff_id: string; customer_type: string; amount: number; booking_date: string }[] = [];
  let retailSales: { staff_id: string | null; amount: number; sale_date: string }[] = [];
  let manualSales: { staff_id: string; existing_amount: number; new_amount: number; sale_date: string }[] = [];
  if (ids.length) {
    const [{ data: bookingData }, { data: retailData }, { data: manualData }] = await Promise.all([
      sb
        .from('bookings')
        .select('staff_id,customer_type,amount,booking_date')
        .gte('booking_date', start)
        .lte('booking_date', end)
        .in('staff_id', ids),
      sb
        .from('retail_sales')
        .select('staff_id,amount,sale_date')
        .gte('sale_date', start)
        .lte('sale_date', end)
        .in('staff_id', ids),
      sb
        .from('freelance_daily_sales')
        .select('staff_id,existing_amount,new_amount,sale_date')
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

  let dailyRows: FreelanceDailyRow[] = [];
  if (view === 'month') {
    const dailyMap = new Map<string, FreelanceDailyRow>();
    const keyOf = (staffId: string, d: string) => `${staffId}|${d}`;
    const rowFor = (s: Staff, d: string) => {
      const key = keyOf(s.id, d);
      let row = dailyMap.get(key);
      if (!row) {
        row = { date: d, staffId: s.id, staffName: s.name, count: 0, bookingEx: 0, bookingNw: 0, manualEx: 0, manualNw: 0, retailSales: 0 };
        dailyMap.set(key, row);
      }
      return row;
    };
    const staffById = new Map(staff.map((s) => [s.id, s]));
    for (const b of bookings) {
      const s = staffById.get(b.staff_id);
      if (!s) continue;
      const row = rowFor(s, b.booking_date);
      row.count += 1;
      if (b.customer_type === 'existing') row.bookingEx += b.amount ?? 0;
      else row.bookingNw += b.amount ?? 0;
    }
    for (const r of retailSales) {
      const s = r.staff_id ? staffById.get(r.staff_id) : undefined;
      if (!s) continue;
      rowFor(s, r.sale_date).retailSales += r.amount ?? 0;
    }
    for (const m of manualSales) {
      const s = staffById.get(m.staff_id);
      if (!s) continue;
      const row = rowFor(s, m.sale_date);
      row.manualEx += m.existing_amount ?? 0;
      row.manualNw += m.new_amount ?? 0;
    }
    dailyRows = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date) || a.staffName.localeCompare(b.staffName));
  }

  return (
    <FreelanceClient
      rows={rows}
      dailyRows={dailyRows}
      date={date}
      view={view}
      month={month}
      initialExRate={settings?.existing_rate ?? 60}
      initialNwRate={settings?.new_rate ?? 50}
      initialRetailRate={settings?.retail_rate ?? 20}
    />
  );
}
