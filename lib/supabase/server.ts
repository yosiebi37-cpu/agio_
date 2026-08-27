import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/types';

/** 環境変数が設定済みか（未設定なら画面に案内を表示する） */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** サーバーコンポーネント / Route Handler 用の Supabase クライアント（Cookie のログインセッションを利用） */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は書き込み不可（middleware がセッション更新を担当）
        }
      },
    },
  });
}

/**
 * ログイン中のユーザーが「スタッフ用アカウント」に紐付いているか調べる。
 * 見つかれば、そのスタッフの閲覧範囲だけに制限する（オーナーアカウントは null になる）。
 */
export async function getCurrentStaff(sb: SupabaseClient): Promise<Staff | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('staff').select('*').eq('user_id', user.id).maybeSingle();
  return (data as Staff | null) ?? null;
}
