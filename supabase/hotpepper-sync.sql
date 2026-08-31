-- ============================================================================
--  HotPepper Beauty（SALON BOARD）の予約通知メールを自動反映するための追加設定
--  すでに schema.sql を実行済みのプロジェクトで、この内容だけ追加実行してください。
-- ============================================================================

alter table bookings add column if not exists hotpepper_reservation_id text unique;
alter table bookings add column if not exists source text not null default 'manual'
  check (source in ('manual', 'hotpepper'));

create table if not exists hotpepper_sync_log (
  id         uuid primary key default gen_random_uuid(),
  subject    text,
  raw_body   text,
  result     text not null check (result in ('created', 'cancelled', 'skipped', 'error')),
  message    text,
  created_at timestamptz not null default now()
);

alter table hotpepper_sync_log enable row level security;
drop policy if exists "staff_authenticated_all" on hotpepper_sync_log;
create policy "staff_authenticated_all" on hotpepper_sync_log for all to authenticated using (true) with check (true);
