-- ============================================================================
--  agio — 臨時営業日（定休日だけど、この日だけ営業する日）テーブルを追加
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  一度実行すれば十分です（再実行しても安全です）。
-- ============================================================================

create table if not exists open_days (
  id         uuid primary key default gen_random_uuid(),
  open_date  date not null unique,
  note       text,
  created_at timestamptz not null default now()
);

alter table open_days enable row level security;

drop policy if exists "staff_authenticated_all" on open_days;
create policy "staff_authenticated_all" on open_days for all to authenticated using (true) with check (true);

-- お客様向け予約ページ（未ログイン）からも営業日かどうかを確認できるようにする
grant select on open_days to anon;
drop policy if exists "public_open_days_select" on open_days;
create policy "public_open_days_select" on open_days for select to anon using (true);
