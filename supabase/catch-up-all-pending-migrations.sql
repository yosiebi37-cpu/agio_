-- ============================================================================
--  溜まってしまった未実行のデータベース変更を、まとめて一度に実行するための
--  まとめSQL。何度実行しても安全（すでに反映済みの部分はスキップされる）。
--  2026-09-23 時点で必要な分をすべて含む。
-- ============================================================================

-- ① 予約ボードの「残り受付可能数」30分単位対応
alter table hourly_capacity add column if not exists minute int not null default 0;
alter table hourly_capacity drop constraint if exists hourly_capacity_minute_check;
alter table hourly_capacity add constraint hourly_capacity_minute_check check (minute in (0, 30));

alter table hourly_capacity drop constraint if exists hourly_capacity_capacity_date_hour_key;
alter table hourly_capacity add constraint hourly_capacity_capacity_date_hour_minute_key unique (capacity_date, hour, minute);

insert into hourly_capacity (capacity_date, hour, minute, capacity)
select capacity_date, hour, 30, capacity
from hourly_capacity
where minute = 0
on conflict (capacity_date, hour, minute) do nothing;

create or replace view public_hourly_capacity as
  select capacity_date, hour, minute, capacity
  from hourly_capacity;

grant select on public_hourly_capacity to anon;

-- ② LINE・Google予約ページの二重予約・多重送信防止
alter table bookings add column if not exists idempotency_key text unique;

-- ③ 店販とお客様・予約のひもづけ（カルテ・予約ボードへの店販表示）
alter table retail_sales add column if not exists customer_id uuid references customers(id) on delete set null;
alter table retail_sales add column if not exists booking_id uuid references bookings(id) on delete set null;

-- ④ 「来店済みに」を押した時にカルテへ反映されない不具合の修正
drop index if exists treatment_records_booking_id_idx;
create unique index if not exists treatment_records_booking_id_idx on treatment_records (booking_id);

-- ⑤ 予約ページのメニューをカテゴリタブ分けするための列
alter table menu_items add column if not exists category text;
