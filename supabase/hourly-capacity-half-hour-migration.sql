-- ============================================================================
--  予約ボードの「残り受付可能数」を、1時間単位ではなく30分単位で
--  設定・確認できるようにする（例：9:00〜9:30 と 9:30〜10:00 を別々に設定）
--  既存の設定（1時間単位）は、そのままその時間の前半・後半の両方に適用される。
-- ============================================================================

alter table hourly_capacity add column if not exists minute int not null default 0;
alter table hourly_capacity drop constraint if exists hourly_capacity_minute_check;
alter table hourly_capacity add constraint hourly_capacity_minute_check check (minute in (0, 30));

alter table hourly_capacity drop constraint if exists hourly_capacity_capacity_date_hour_key;
alter table hourly_capacity drop constraint if exists hourly_capacity_capacity_date_hour_minute_key;
alter table hourly_capacity add constraint hourly_capacity_capacity_date_hour_minute_key unique (capacity_date, hour, minute);

-- 既存の「1時間単位」の設定を、後半30分（:30）にも複製する
insert into hourly_capacity (capacity_date, hour, minute, capacity)
select capacity_date, hour, 30, capacity
from hourly_capacity
where minute = 0
on conflict (capacity_date, hour, minute) do nothing;

-- 既存のビューは列構成（capacity_date, hour, capacity）が違うため、
-- create or replace では列の入れ替えができない。作り直す。
drop view if exists public_hourly_capacity;
create view public_hourly_capacity as
  select capacity_date, hour, minute, capacity
  from hourly_capacity;

grant select on public_hourly_capacity to anon;
