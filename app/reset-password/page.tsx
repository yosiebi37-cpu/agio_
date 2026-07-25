import ResetPasswordForm from '@/components/ResetPasswordForm';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import SetupNotice from '@/components/SetupNotice';

export default function ResetPasswordPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">agio</div>
        <div className="login-sub">新しいパスワードを設定</div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
