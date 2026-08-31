import type { Metadata } from 'next';
import './globals.css';
import TopBar from '@/components/TopBar';
import { isSupabaseConfigured, getServerSupabase, getCurrentStaff } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Atelier — 予約管理',
  description: '美容室向けの予約・顧客・カルテ・業務委託管理ダッシュボード',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isStaff = false;
  if (isSupabaseConfigured()) {
    const sb = await getServerSupabase();
    isStaff = !!(await getCurrentStaff(sb));
  }

  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body>
        <TopBar isStaff={isStaff} />
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
