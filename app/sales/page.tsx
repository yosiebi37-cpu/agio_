import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SalesClient from '@/components/SalesClient';
import DailyReportClient from '@/components/DailyReportClient';
import { toISODate } from '@/lib/format';
import type { Staff, RetailSale } from '@/lib/types';

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
  searchParams: Promise<{ month?: string; view?: string; date?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { month: monthParam, view: viewParam, date: dateParam } = await searchParams;
  const sb = await getServerSupabase();

  if (viewParam === 'day') {
    const date = dateParam ?? toISODate(new Date());
    const [{ data: bookingsData }, { data: staffData }, { data: retailData }] = await Promise.all([
      sb
        .from('bookings')
        .select('id,customer_name,staff_id,start_time,menu,amount,status,customer_type')
        .eq('booking_date', date)
        .order('start_time'),
      sb.from('staff').select('*').order('sort_order'),
      sb.from('retail_sales').select('*').eq('sale_date', date).order('created_at'),
    ]);

    return (
      <DailyReportClient
        date={date}
        bookings={
          (bookingsData ?? []) as {
            id: string;
            customer_name: string;
            staff_id: string;
            start_time: string;
            menu: string;
            amount: number;
            status: string;
            customer_type: string;
          }[]
        }
        staff={(staffData ?? []) as Staff[]}
        retailSales={(retailData ?? []) as RetailSale[]}
      />
    );
  }

  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(month);

  const [{ data: bookingsData }, { data: staffData }, { data: retailData }] = await Promise.all([
    sb
      .from('bookings')
      .select('booking_date,staff_id,amount,status,customer_type')
      .gte('booking_date', start)
      .lte('booking_date', end),
    sb.from('staff').select('*').order('sort_order'),
    sb.from('retail_sales').select('amount').gte('sale_date', start).lte('sale_date', end),
  ]);

  const retailTotal = (retailData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <SalesClient
      month={month}
      bookings={(bookingsData ?? []) as { booking_date: string; staff_id: string; amount: number; status: string; customer_type: string }[]}
      staff={(staffData ?? []) as Staff[]}
      retailTotal={retailTotal}
    />
  );
}
