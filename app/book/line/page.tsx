import type { Metadata } from 'next';
import { isSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';
import BookClient from '@/components/BookClient';
import { FALLBACK_MENUS } from '@/lib/constants';
import type { MenuItem, PublicStaff } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'agio ご予約（LINE限定）',
  description: 'agio hair&spa（武蔵境）のLINE限定メニューのご予約はこちらから。',
  openGraph: {
    title: 'agio ご予約（LINE限定）',
    description: 'agio hair&spa（武蔵境）のLINE限定メニューのご予約はこちらから。',
    siteName: 'agio hair&spa',
    locale: 'ja_JP',
    type: 'website',
  },
};

// LINE公式アカウントに貼るリンク専用の予約ページ。LINE限定メニューだけを表示する。
export default async function BookLinePage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const sb = await getServerSupabase();
  const [{ data: menuData }, { data: staffData }] = await Promise.all([
    sb.from('menu_items').select('*').eq('is_active', true).order('sort_order'),
    sb.from('public_staff').select('*').order('sort_order'),
  ]);

  const allMenuItems = (menuData ?? []).length ? (menuData as MenuItem[]) : FALLBACK_MENUS;
  const menuItems = allMenuItems.filter((m) => m.line_only);
  const staff = (staffData ?? []) as PublicStaff[];

  return <BookClient menuItems={menuItems} staff={staff} useLiff />;
}
