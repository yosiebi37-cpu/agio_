-- ============================================================================
--  予約前日リマインダー（LINE通知）機能のための移行スクリプト
--  Supabase の SQL Editor にこのファイルを貼り付けて実行してください。
-- ============================================================================

-- 予約前日リマインダー（LINE通知）の送信済みフラグ
alter table bookings add column if not exists reminder_sent_at timestamptz;

-- LINEで予約したお客様のLINEユーザーID（前日リマインダー送信に使う。LIFFログインで取得）
alter table customers add column if not exists line_user_id text;
