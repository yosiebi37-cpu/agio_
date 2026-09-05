import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SalesClient from '@/components/SalesClient';
import DailyReportClient from '@/components/DailyReportClient';
import { toISODate } from '@/lib/format';
import type { Staff, RetailSale, Expense } from '@/lib/types';

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
  if (await getCurrentStaff(sb)) redirect('/board');

  if (viewParam === 'day') {
    const date = dateParam ?? toISODate(new Date());
    const [{ data: bookingsData }, { data: staffData }, { data: retailData }, { data: manualData }, { data: expensesData }] = await Promise.all([
      sb
        .from('bookings')
        .select('id,customer_name,staff_id,start_time,menu,amount,status,customer_type')
        .eq('booking_date', date)
        .order('start_time'),
      sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
      sb.from('retail_sales').select('*').eq('sale_date', date).order('created_at'),
      sb.from('freelance_daily_sales').select('staff_id,existing_amount,new_amount').eq('sale_date', date),
      sb.from('expenses').select('*').eq('expense_date', date).order('created_at'),
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
        manualSales={
          (manualData ?? []) as { staff_id: string; existing_amount: number; new_amount: number }[]
        }
        expenses={(expensesData ?? []) as Expense[]}
      />
    );
  }

  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(month);

  const [{ data: bookingsData }, { data: staffData }, { data: retailData }, { data: manualData }, { data: settingsData }] = await Promise.all([
    sb
      .from('bookings')
      .select('booking_date,staff_id,amount,status,customer_type')
      .gte('booking_date', start)
      .lte('booking_date', end),
    sb.from('staff').select('*').order('sort_order'),
    sb.from('retail_sales').select('staff_id,amount,product_name').gte('sale_date', start).lte('sale_date', end),
    sb
      .from('freelance_daily_sales')
      .select('staff_id,existing_amount,new_amount')
      .gte('sale_date', start)
      .lte('sale_date', end),
    sb.from('commission_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  const bookings = (bookingsData ?? []) as { booking_date: string; staff_id: string; amount: number; status: string; customer_type: string }[];
  const staff = (staffData ?? []) as Staff[];
  const retail = (retailData ?? []) as { staff_id: string | null; amount: number; product_name: string }[];
  const manual = (manualData ?? []) as { staff_id: string; existing_amount: number; new_amount: number }[];

  const retailTotal = retail.reduce((s, r) => s + (r.amount ?? 0), 0);

  const retailByProductMap = new Map<string, number>();
  for (const r of retail) {
    retailByProductMap.set(r.product_name, (retailByProductMap.get(r.product_name) ?? 0) + (r.amount ?? 0));
  }
  const retailByProduct = Array.from(retailByProductMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const contractIds = new Set(staff.filter((s) => s.employment_type === 'contract').map((s) => s.id));
  const exRate = settingsData?.existing_rate ?? 60;
  const nwRate = settingsData?.new_rate ?? 50;
  const retailRate = settingsData?.retail_rate ?? 20;

  const contractEx = bookings
    .filter((b) => contractIds.has(b.staff_id) && b.customer_type === 'existing')
    .reduce((s, b) => s + (b.amount ?? 0), 0)
    + manual.filter((m) => contractIds.has(m.staff_id)).reduce((s, m) => s + (m.existing_amount ?? 0), 0);
  const contractNw = bookings
    .filter((b) => contractIds.has(b.staff_id) && b.customer_type === 'new')
    .reduce((s, b) => s + (b.amount ?? 0), 0)
    + manual.filter((m) => contractIds.has(m.staff_id)).reduce((s, m) => s + (m.new_amount ?? 0), 0);
  const contractRetail = retail
    .filter((r) => r.staff_id && contractIds.has(r.staff_id))
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  const commissionTotal =
    Math.round((contractEx * exRate) / 100) +
    Math.round((contractNw * nwRate) / 100) +
    Math.round((contractRetail * retailRate) / 100);

  return (
    <SalesClient
      month={month}
      bookings={bookings}
      staff={staff}
      retailTotal={retailTotal}
      retailByProduct={retailByProduct}
      commissionTotal={commissionTotal}
    />
  );
}
