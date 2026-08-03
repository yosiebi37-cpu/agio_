-- 店販売上（シャンプー・スタイリング剤などの店頭販売）
-- 既存プロジェクトに1度だけ適用するマイグレーション

create table if not exists retail_sales (
  id           uuid primary key default gen_random_uuid(),
  sale_date    date not null,
  staff_id     uuid references staff(id) on delete set null,
  product_name text not null,
  amount       int not null default 0,
  created_at   timestamptz not null default now()
);

alter table retail_sales enable row level security;

drop policy if exists "staff_authenticated_all" on retail_sales;
create policy "staff_authenticated_all" on retail_sales for all to authenticated using (true) with check (true);
