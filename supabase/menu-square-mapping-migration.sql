-- ============================================================================
--  HotPepper経由の予約を、自動でSquareにも登録できるようにする
--  （メニューをSquare側のサービスと対応付けるための列）
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table menu_items add column if not exists square_service_variation_id text;
