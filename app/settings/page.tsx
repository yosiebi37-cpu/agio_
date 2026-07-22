import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SettingsClient from '@/components/SettingsClient';
import type { Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const { data: staffData } = await sb.from('staff').select('*').order('sort_order');
  const staff = (staffData ?? []) as Staff[];

  return <SettingsClient staff={staff} />;
}
