import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SettingsClient from '@/components/SettingsClient';
import type { Staff, SalonSettings, Holiday } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const [{ data: staffData }, { data: salonSettingsData }, { data: holidaysData }] = await Promise.all([
    sb.from('staff').select('*').order('sort_order'),
    sb.from('salon_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('holidays').select('*').order('holiday_date'),
  ]);

  const staff = (staffData ?? []) as Staff[];
  const salonSettings = (salonSettingsData as SalonSettings | null) ?? { id: 1, closed_weekdays: [], updated_at: '' };
  const holidays = (holidaysData ?? []) as Holiday[];

  return <SettingsClient staff={staff} salonSettings={salonSettings} holidays={holidays} />;
}
