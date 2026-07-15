import LoginForm from '@/components/LoginForm';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { redirect } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">agio</div>
        <div className="login-sub">スタッフ専用ログイン</div>
        <LoginForm redirectTo={redirect && redirect !== '/login' ? redirect : '/board'} />
      </div>
    </div>
  );
}
