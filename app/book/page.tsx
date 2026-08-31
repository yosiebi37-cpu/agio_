import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import BookClient from '@/components/BookClient';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { MenuItem, Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BookPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const [{ data: menuData }, { data: staffData }] = await Promise.all([
    sb.from('menu_items').select('*').eq('is_active', true).order('sort_order'),
    sb.from('staff').select('*').eq('is_active', true).order('sort_order'),
  ]);

  const menuItems = (menuData ?? []).length ? (menuData as MenuItem[]) : FALLBACK_MENUS;
  const staff = (staffData ?? []) as Staff[];

  return <BookClient menuItems={menuItems} staff={staff} />;
}
