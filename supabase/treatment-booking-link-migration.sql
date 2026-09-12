-- ============================================================================
--  予約を「来店済み」にした時、その内容（メニュー・金額・メモなど）を
--  自動でカルテの施術履歴に反映できるようにする
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table treatment_records add column if not exists booking_id uuid references bookings(id) on delete set null;
create unique index if not exists treatment_records_booking_id_idx on treatment_records (booking_id) where booking_id is not null;
