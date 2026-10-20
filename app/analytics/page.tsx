import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import AnalyticsClient from '@/components/AnalyticsClient';
import {
  aggregateMonthlyCustomers,
  aggregateMonthlyRetail,
  computeRepeatRatesFromVisits,
  aggregateAgeBrackets,
  listNewCustomerNamesByMonth,
  reclassifyVisitTypes,
  type VisitBookingRow,
  type CustomerTypeRow,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  if (await getCurrentStaff()) redirect('/board');

  // Supabase は1回の取得が最大1000件までなので、予約は1000件ずつに分けて全件取得する
  const fetchAllBookings = async (): Promise<VisitBookingRow[]> => {
    const PAGE = 1000;
    const all: VisitBookingRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('bookings')
        .select('id,booking_date,start_time,customer_id,customer_type,status,amount,customer_name')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      all.push(...(data as VisitBookingRow[]));
      if (data.length < PAGE) break;
    }
    return all;
  };

  const [bookingsData, { data: retailData }, { data: customersData }] = await Promise.all([
    fetchAllBookings(),
    sb.from('retail_sales').select('sale_date,amount'),
    sb.from('customers').select('id,customer_type,visit_count_offset,birth_year'),
  ]);

  const customerRows = (customersData ?? []) as (CustomerTypeRow & { birth_year: number | null })[];
  // 予約ごとの「新規/既存」ではなく、お客様単位で「初めての来店か」を判定し直してから集計する
  const bookingRows = reclassifyVisitTypes(bookingsData, customerRows);
  const monthlyCustomers = aggregateMonthlyCustomers(bookingRows);
  const newCustomerNames = listNewCustomerNamesByMonth(bookingRows);
  const monthlyRetail = aggregateMonthlyRetail(
    (retailData ?? []) as { sale_date: string; amount: number }[],
  );
  const repeatRates = computeRepeatRatesFromVisits(bookingRows);
  const ageBrackets = aggregateAgeBrackets(
    customerRows.map((c) => c.birth_year),
  );

  return (
    <AnalyticsClient
      monthlyCustomers={monthlyCustomers}
      monthlyRetail={monthlyRetail}
      repeatRates={repeatRates}
      ageBrackets={ageBrackets}
      newCustomerNames={newCustomerNames}
    />
  );
}
