import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import CustomersClient from '@/components/CustomersClient';
import type { Staff, CustomerWithStaff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = getServerSupabase();
  const [{ data: custData }, { data: staffData }] = await Promise.all([
    sb.from('customers').select('*, staff:assigned_staff_id(name)').order('name'),
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
  ]);

  const customers = (custData ?? []) as unknown as CustomerWithStaff[];
  const staff = (staffData ?? []) as Staff[];

  return <CustomersClient customers={customers} staff={staff} />;
}
