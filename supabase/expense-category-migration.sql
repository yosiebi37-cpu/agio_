-- ============================================================================
--  経費にカテゴリ（家賃・水道・電気…）を追加し、項目名を任意入力に変更する
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table expenses add column if not exists category text not null default 'その他経費';
alter table expenses alter column item_name drop not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'expenses'::regclass and contype = 'c' and conname like '%category%';
  if c is not null then
    execute format('alter table expenses drop constraint %I', c);
  end if;
end $$;
alter table expenses add constraint expenses_category_check
  check (category in ('家賃','水道','電気','ガス','シャンプー台リース','広告費','材料費','返済','通信費','報酬','消耗品','手数料','雑費','その他経費'));
