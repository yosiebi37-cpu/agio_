import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SalesClient, { type SalesBooking } from '@/components/SalesClient';

export const dynamic = 'force-dynamic';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { month: monthParam } = await searchParams;

  const now = new Date();
  const month = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const sb = getServerSupabase();

  const { data } = await sb
    .from('bookings')
    .select('booking_date, staff_id, customer_type, customer_id, amount, shop_amount, status, staff:staff_id(name)')
    .gte('booking_date', from)
    .lte('booking_date', to)
    .order('booking_date');

  const bookings: SalesBooking[] = ((data ?? []) as any[]).map((b) => ({
    booking_date: b.booking_date,
    staff_id:     b.staff_id,
    staff_name:   b.staff?.name ?? '—',
    customer_type: b.customer_type,
    customer_id:  b.customer_id,
    amount:       b.amount ?? 0,
    shop_amount:  b.shop_amount ?? 0,
    status:       b.status,
  }));

  return <SalesClient bookings={bookings} month={month} />;
}
