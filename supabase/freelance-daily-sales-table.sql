-- 業務委託スタッフの日次売上（予約ボードを使わない場合の手入力）
-- 既存プロジェクトに1度だけ適用するマイグレーション

create table if not exists freelance_daily_sales (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  sale_date      date not null,
  existing_amount int not null default 0,
  new_amount      int not null default 0,
  created_at     timestamptz not null default now(),
  unique (staff_id, sale_date)
);

alter table freelance_daily_sales enable row level security;

drop policy if exists "staff_authenticated_all" on freelance_daily_sales;
create policy "staff_authenticated_all" on freelance_daily_sales for all to authenticated using (true) with check (true);
