import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import CustomersClient from '@/components/CustomersClient';
import type { LineLinkRequest } from '@/components/LineLinkRequests';
import type { Staff, CustomerWithStaff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const [{ data: custData }, { data: staffData }, { data: requestData }] = await Promise.all([
    sb.from('customers').select('*, staff:assigned_staff_id(name)').order('furigana', { ascending: true, nullsFirst: false }).order('name'),
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
    // LINEからの連携申請（確認待ちのもの）。表がまだ無い場合は空として扱う
    sb.from('line_link_requests').select('*').eq('status', 'pending').order('created_at'),
  ]);

  const customers = (custData ?? []) as unknown as CustomerWithStaff[];
  const staff = (staffData ?? []) as Staff[];
  const linkRequests = (requestData ?? []) as LineLinkRequest[];

  return <CustomersClient customers={customers} staff={staff} linkRequests={linkRequests} />;
}
