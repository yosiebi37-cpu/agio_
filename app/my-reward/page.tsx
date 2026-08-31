import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import MyRewardClient from '@/components/MyRewardClient';
import { toISODate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function MyRewardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const staff = await getCurrentStaff(sb);

  if (!staff) {
    return (
      <div className="page-wrap">
        <div className="inner-page">
          <div className="empty-row" style={{ marginTop: 40 }}>
            この画面はスタッフ用アカウントでログインしたときに表示されます。
          </div>
        </div>
      </div>
    );
  }

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(month);

  const [{ data: bookingsData }, { data: retailData }, { data: manualData }, { data: settingsData }] = await Promise.all([
    sb
      .from('bookings')
      .select('customer_type,amount,status')
      .eq('staff_id', staff.id)
      .gte('booking_date', start)
      .lte('booking_date', end),
    sb.from('retail_sales').select('amount').eq('staff_id', staff.id).gte('sale_date', start).lte('sale_date', end),
    sb
      .from('freelance_daily_sales')
      .select('existing_amount,new_amount')
      .eq('staff_id', staff.id)
      .gte('sale_date', start)
      .lte('sale_date', end),
    sb.from('commission_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  const bookings = (bookingsData ?? []) as { customer_type: string; amount: number; status: string }[];
  const retail = (retailData ?? []) as { amount: number }[];
  const manual = (manualData ?? []) as { existing_amount: number; new_amount: number }[];

  const visited = bookings.filter((b) => b.status === 'visited');
  const bookingEx = visited.filter((b) => b.customer_type === 'existing').reduce((s, b) => s + (b.amount ?? 0), 0);
  const bookingNw = visited.filter((b) => b.customer_type === 'new').reduce((s, b) => s + (b.amount ?? 0), 0);
  const manualEx = manual.reduce((s, m) => s + (m.existing_amount ?? 0), 0);
  const manualNw = manual.reduce((s, m) => s + (m.new_amount ?? 0), 0);
  const retailTotal = retail.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <MyRewardClient
      staffName={staff.name}
      employmentType={staff.employment_type}
      month={month}
      visitCount={visited.length}
      existingSales={bookingEx + manualEx}
      newSales={bookingNw + manualNw}
      retailSales={retailTotal}
      exRate={settingsData?.existing_rate ?? 60}
      nwRate={settingsData?.new_rate ?? 50}
      retailRate={settingsData?.retail_rate ?? 20}
    />
  );
}
