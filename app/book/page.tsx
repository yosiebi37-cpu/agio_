import type { Metadata } from 'next';
import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import BookClient from '@/components/BookClient';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { MenuItem, PublicStaff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'agio ご予約',
  description: 'agio hair&spa（武蔵境）のオンライン予約はこちらから。メニュー・スタイリストを選んで、簡単にご予約いただけます。',
  openGraph: {
    title: 'agio ご予約',
    description: 'agio hair&spa（武蔵境）のオンライン予約はこちらから。',
    siteName: 'agio hair&spa',
    locale: 'ja_JP',
    type: 'website',
  },
};

export default async function BookPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const [{ data: menuData }, { data: staffData }] = await Promise.all([
    sb.from('menu_items').select('*').eq('is_active', true).order('sort_order'),
    sb.from('public_staff').select('*').order('sort_order'),
  ]);

  const allMenuItems = (menuData ?? []).length ? (menuData as MenuItem[]) : FALLBACK_MENUS;
  const menuItems = allMenuItems.filter((m) => !m.line_only);
  const staff = (staffData ?? []) as PublicStaff[];

  return <BookClient menuItems={menuItems} staff={staff} />;
}
