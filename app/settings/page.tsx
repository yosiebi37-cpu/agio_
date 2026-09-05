import { redirect } from 'next/navigation';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import SettingsClient from '@/components/SettingsClient';
import type { Staff, SalonSettings, Holiday, MenuItem, RetailProduct } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  if (await getCurrentStaff(sb)) redirect('/board');
  const [{ data: staffData }, { data: salonSettingsData }, { data: holidaysData }, { data: menuItemsData }, { data: retailProductsData }] = await Promise.all([
    sb.from('staff').select('*').order('sort_order'),
    sb.from('salon_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('holidays').select('*').order('holiday_date'),
    sb.from('menu_items').select('*').order('sort_order'),
    sb.from('retail_products').select('*').order('sort_order'),
  ]);

  const staff = (staffData ?? []) as Staff[];
  const salonSettings = (salonSettingsData as SalonSettings | null) ?? { id: 1, closed_weekdays: [], updated_at: '' };
  const holidays = (holidaysData ?? []) as Holiday[];
  const menuItems = (menuItemsData ?? []) as MenuItem[];
  const retailProducts = (retailProductsData ?? []) as RetailProduct[];

  return (
    <SettingsClient
      staff={staff}
      salonSettings={salonSettings}
      holidays={holidays}
      menuItems={menuItems}
      retailProducts={retailProducts}
    />
  );
}
