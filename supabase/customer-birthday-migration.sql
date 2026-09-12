-- ============================================================================
--  お客様の誕生日に「月」「日」も記録できるようにする（今までは生まれ年のみでした）
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table customers add column if not exists birth_month int check (birth_month between 1 and 12);
alter table customers add column if not exists birth_day int check (birth_day between 1 and 31);
