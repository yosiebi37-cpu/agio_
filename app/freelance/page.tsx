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
  if (ids.length) {
    const [{ data: bookingData }, { data: retailData }] = await Promise.all([
      sb
        .from('bookings')
        .select('staff_id,customer_type,amount')
        .eq('booking_date', date)
        .in('staff_id', ids),
      sb
        .from('retail_sales')
        .select('staff_id,amount')
        .eq('sale_date', date)
        .in('staff_id', ids),
    ]);
    bookings = (bookingData ?? []) as typeof bookings;
    retailSales = (retailData ?? []) as typeof retailSales;
  }

  const rows: FreelanceRow[] = staff.map((s) => {
    const mine = bookings.filter((b) => b.staff_id === s.id);
    const myRetail = retailSales.filter((r) => r.staff_id === s.id);
    return {
      id: s.id,
      name: s.name,
      initials: s.initials,
      bg: s.bg_color,
      fg: s.fg_color,
      count: mine.length,
      exSales: mine.filter((b) => b.customer_type === 'existing').reduce((sum, b) => sum + (b.amount ?? 0), 0),
      nwSales: mine.filter((b) => b.customer_type === 'new').reduce((sum, b) => sum + (b.amount ?? 0), 0),
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
      initialExRate={settings?.existing_rate ?? 60}
      initialNwRate={settings?.new_rate ?? 50}
      initialRetailRate={settings?.retail_rate ?? 20}
    />
  );
}
