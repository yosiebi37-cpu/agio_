-- ============================================================================
--  来店後のLINE自動メッセージ（来店翌日のお礼・45日後・90日後のご案内）を
--  同じ予約に二重に送らないための「送信済み」の記録
--  Supabaseの SQL Editor にこの内容を貼り付けて「Run」を押してください。
-- ============================================================================

alter table bookings add column if not exists line_thanks_sent_at timestamptz;
alter table bookings add column if not exists line_followup45_sent_at timestamptz;
alter table bookings add column if not exists line_followup90_sent_at timestamptz;
