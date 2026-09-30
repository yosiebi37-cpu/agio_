-- ============================================================================
--  経費カテゴリに「ホットペッパー」「コンサル費」「融資」「材料の業者別
--  （TID/JIKSHIN美容/コタ/絹－ジョ）」「コインランドリー」を追加する移行スクリプト
-- ============================================================================

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
  check (category in ('家賃','水道','電気','ガス','通信費','ホットペッパー','コンサル費','融資','返済','TID','JIKSHIN美容','コタ','絹－ジョ','材料費','コインランドリー','シャンプー台リース','広告費','報酬','消耗品','手数料','雑費','その他経費'));
