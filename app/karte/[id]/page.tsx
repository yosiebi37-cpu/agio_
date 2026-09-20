import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import KarteClient from '@/components/KarteClient';
import type { Customer, TreatmentRecord, ChemicalRecord, Staff, KartePhoto, RetailSale } from '@/lib/types';

export const dynamic = 'force-dynamic';

type CustomerWithStaff = Customer & { staff?: { name: string } | null };
type TreatmentWithStaff = TreatmentRecord & { staff?: { name: string } | null };

export default async function KartePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const sb = await getServerSupabase();

  const { data: customer } = await sb
    .from('customers')
    .select('*, staff:assigned_staff_id(name)')
    .eq('id', id)
    .maybeSingle();

  if (!customer) {
    return (
      <div className="page-wrap">
        <div className="inner-page">
          <div className="empty-row">顧客が見つかりませんでした。</div>
        </div>
      </div>
    );
  }

  const [{ data: treatments }, { data: chemicals }, { data: staffData }, { data: photos }, { data: retailSales }] = await Promise.all([
    sb
      .from('treatment_records')
      .select('*, staff:staff_id(name)')
      .eq('customer_id', id)
      .order('performed_on', { ascending: false }),
    sb
      .from('chemical_records')
      .select('*')
      .eq('customer_id', id)
      .order('record_on', { ascending: false }),
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
    sb
      .from('karte_photos')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    sb
      .from('retail_sales')
      .select('*')
      .eq('customer_id', id)
      .order('sale_date', { ascending: false }),
  ]);

  return (
    <KarteClient
      customer={customer as unknown as CustomerWithStaff}
      treatments={(treatments ?? []) as unknown as TreatmentWithStaff[]}
      chemicals={(chemicals ?? []) as unknown as ChemicalRecord[]}
      staff={(staffData ?? []) as Staff[]}
      photos={(photos ?? []) as KartePhoto[]}
      retailSales={(retailSales ?? []) as RetailSale[]}
      defaultTreatmentDate={dateParam}
    />
  );
}
