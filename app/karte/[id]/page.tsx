import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import KarteClient from '@/components/KarteClient';
import type { Customer, TreatmentRecord, ChemicalRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

type CustomerWithStaff = Customer & { staff?: { name: string } | null };
type TreatmentWithStaff = TreatmentRecord & { staff?: { name: string } | null };

export default async function KartePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const sb = getServerSupabase();

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

  const [{ data: treatments }, { data: chemicals }, { data: photos }] = await Promise.all([
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
    sb
      .from('karte_photos')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <KarteClient
      customer={customer as unknown as CustomerWithStaff}
      treatments={(treatments ?? []) as unknown as TreatmentWithStaff[]}
      chemicals={(chemicals ?? []) as unknown as ChemicalRecord[]}
      photos={(photos ?? []) as { id: string; storage_path: string; kind: string | null; taken_on: string | null }[]}
      customerId={id}
    />
  );
}
