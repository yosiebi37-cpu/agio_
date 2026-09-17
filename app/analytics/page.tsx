import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import AnalyticsClient from '@/components/AnalyticsClient';
import { aggregateMonthlyCustomers, aggregateMonthlyRetail, computeRepeatRates } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  if (await getCurrentStaff()) redirect('/board');

  const [{ data: bookingsData }, { data: retailData }, { data: recordsData }] = await Promise.all([
    sb.from('bookings').select('booking_date,customer_type,status,amount'),
    sb.from('retail_sales').select('sale_date,amount'),
    sb.from('treatment_records').select('customer_id,performed_on'),
  ]);

  const monthlyCustomers = aggregateMonthlyCustomers(
    (bookingsData ?? []) as { booking_date: string; customer_type: string; status: string; amount: number }[],
  );
  const monthlyRetail = aggregateMonthlyRetail(
    (retailData ?? []) as { sale_date: string; amount: number }[],
  );
  const repeatRates = computeRepeatRates(
    (recordsData ?? []) as { customer_id: string; performed_on: string }[],
  );

  return <AnalyticsClient monthlyCustomers={monthlyCustomers} monthlyRetail={monthlyRetail} repeatRates={repeatRates} />;
}
