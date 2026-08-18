-- 経費（日ごとの支出）
-- 既存プロジェクトに1度だけ適用するマイグレーション

create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date not null,
  item_name    text not null,
  amount       int not null default 0,
  created_at   timestamptz not null default now()
);

alter table expenses enable row level security;

drop policy if exists "staff_authenticated_all" on expenses;
create policy "staff_authenticated_all" on expenses for all to authenticated using (true) with check (true);
