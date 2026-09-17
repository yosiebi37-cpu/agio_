-- ============================================================================
--  時間帯ごとの受付可能数を、スタッフが手動で調整できるようにする
--  （予約ボードの「残り受付可能数」。設定が無い時間帯は、出勤スタッフ数
--  「フリー」枠を除く を上限として自動計算する）
--  設定した数を超えると、LINE・Googleマップからのオンライン予約も
--  その時間帯は予約できなくなる。
-- ============================================================================

create table if not exists hourly_capacity (
  id             uuid primary key default gen_random_uuid(),
  capacity_date  date not null,
  hour           int not null check (hour between 0 and 23),
  capacity       int not null default 0,
  created_at     timestamptz not null default now(),
  unique (capacity_date, hour)
);

alter table hourly_capacity enable row level security;

drop policy if exists "staff_authenticated_all" on hourly_capacity;
create policy "staff_authenticated_all" on hourly_capacity for all to authenticated using (true) with check (true);

create or replace view public_hourly_capacity as
  select capacity_date, hour, capacity
  from hourly_capacity;

grant select on public_hourly_capacity to anon;
