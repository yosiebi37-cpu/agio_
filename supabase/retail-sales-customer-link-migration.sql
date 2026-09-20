-- ============================================================================
--  店販売上（retail_sales）を、お客様・予約（カルテ）とひもづけできるようにする
--  これにより、カルテの施術履歴に「その来店で買った店販」を表示したり、
--  予約ボードでその予約の店販購入を確認できるようになる。
-- ============================================================================

alter table retail_sales add column if not exists customer_id uuid references customers(id) on delete set null;
alter table retail_sales add column if not exists booking_id uuid references bookings(id) on delete set null;
