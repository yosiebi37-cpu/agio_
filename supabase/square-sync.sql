-- ============================================================================
--  Square Appointments の予約を自動反映するための追加設定
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table bookings add column if not exists square_booking_id text unique;
alter table staff add column if not exists square_team_member_id text unique;

do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'bookings'::regclass and contype = 'c' and conname like '%source%';
  if c is not null then
    execute format('alter table bookings drop constraint %I', c);
  end if;
end $$;
alter table bookings add constraint bookings_source_check check (source in ('manual', 'hotpepper', 'square'));

create table if not exists square_sync_log (
  id         uuid primary key default gen_random_uuid(),
  event_type text,
  raw_body   text,
  result     text not null check (result in ('created', 'cancelled', 'skipped', 'error')),
  message    text,
  created_at timestamptz not null default now()
);

alter table square_sync_log enable row level security;
drop policy if exists "staff_authenticated_all" on square_sync_log;
create policy "staff_authenticated_all" on square_sync_log for all to authenticated using (true) with check (true);
