-- ============================================================================
--  agio — 定休日（毎週の曜日 + 特定の休業日）テーブルを追加
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  一度実行すれば十分です（再実行しても安全です）。
-- ============================================================================

create table if not exists salon_settings (
  id              int primary key default 1,
  closed_weekdays int[] not null default '{}',              -- 0=日 ... 6=土
  updated_at      timestamptz not null default now(),
  constraint salon_settings_single_row check (id = 1)
);

insert into salon_settings (id) values (1) on conflict (id) do nothing;

create table if not exists holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  note         text,
  created_at   timestamptz not null default now()
);

alter table salon_settings enable row level security;
alter table holidays       enable row level security;

drop policy if exists "staff_authenticated_all" on salon_settings;
create policy "staff_authenticated_all" on salon_settings for all to authenticated using (true) with check (true);

drop policy if exists "staff_authenticated_all" on holidays;
create policy "staff_authenticated_all" on holidays for all to authenticated using (true) with check (true);
