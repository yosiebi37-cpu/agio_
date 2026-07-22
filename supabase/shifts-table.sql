-- ============================================================================
--  agio — スタッフのシフト（出勤時間）テーブルを追加
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  一度実行すれば十分です（再実行しても安全です）。
-- ============================================================================

create table if not exists shifts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  unique (staff_id, shift_date)
);

alter table shifts enable row level security;

drop policy if exists "staff_authenticated_all" on shifts;
create policy "staff_authenticated_all" on shifts for all to authenticated using (true) with check (true);
