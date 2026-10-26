import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import AnalyticsClient from '@/components/AnalyticsClient';
import {
  aggregateMonthlyCustomers,
  aggregateMonthlyRetail,
  computeRepeatRatesFromVisits,
  computeRepeatRatesBySource,
  aggregateAgeBrackets,
  listNewCustomerNamesByMonth,
  reclassifyVisitTypes,
  type VisitBookingRow,
  type CustomerTypeRow,
} from '@/lib/analytics';
import { ACQUISITION_SOURCES, UNKNOWN_ACQUISITION_SOURCE } from '@/lib/constants';

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
        .select('id,booking_date,start_time,customer_id,customer_type,status,amount,customer_name,source')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      all.push(...(data as VisitBookingRow[]));
      if (data.length < PAGE) break;
    }
    return all;
  };

  type CustomerRow = CustomerTypeRow & { birth_year: number | null; acquisition_source?: string | null };
  const fetchCustomers = async (): Promise<CustomerRow[]> => {
    const { data, error } = await sb
      .from('customers')
      .select('id,customer_type,visit_count_offset,birth_year,acquisition_source');
    if (!error) return (data ?? []) as CustomerRow[];
    // 来店経路の列がまだ無い（データベースの更新前）場合は、来店経路なしで取得する
    const retry = await sb.from('customers').select('id,customer_type,visit_count_offset,birth_year');
    return (retry.data ?? []) as CustomerRow[];
  };

  const [bookingsData, { data: retailData }, customerRows] = await Promise.all([
    fetchAllBookings(),
    sb.from('retail_sales').select('sale_date,amount'),
    fetchCustomers(),
  ]);

  // 予約ごとの「新規/既存」ではなく、お客様単位で「初めての来店か」を判定し直してから集計する
  const bookingRows = reclassifyVisitTypes(bookingsData, customerRows);
  const monthlyCustomers = aggregateMonthlyCustomers(bookingRows);
  const newCustomerNames = listNewCustomerNamesByMonth(bookingRows);
  const monthlyRetail = aggregateMonthlyRetail(
    (retailData ?? []) as { sale_date: string; amount: number }[],
  );
  const repeatRates = computeRepeatRatesFromVisits(bookingRows);
  // 日本時間の今日（YYYY-MM-DD）
  const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sourceRepeatRates = computeRepeatRatesBySource(
    bookingRows,
    new Map(customerRows.map((c) => [c.id, c.acquisition_source ?? null])),
    {
      today: todayJst,
      sourceOrder: ACQUISITION_SOURCES,
      unknownLabel: UNKNOWN_ACQUISITION_SOURCE,
      hotpepperLabel: 'ホットペッパー',
      matureDays: 60,
    },
  );
  const ageBrackets = aggregateAgeBrackets(
    customerRows.map((c) => c.birth_year),
  );

  return (
    <AnalyticsClient
      monthlyCustomers={monthlyCustomers}
      monthlyRetail={monthlyRetail}
      repeatRates={repeatRates}
      sourceRepeatRates={sourceRepeatRates}
      ageBrackets={ageBrackets}
      newCustomerNames={newCustomerNames}
    />
  );
}
