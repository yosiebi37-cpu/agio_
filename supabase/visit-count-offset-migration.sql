-- ============================================================================
--  来店回数を手動で調整できるようにする（システム外での来店実績を反映するため）
--  すでに schema.sql（または reset-and-rebuild.sql）を実行済みのプロジェクトで、
--  この内容だけ追加実行してください。
-- ============================================================================

alter table customers add column if not exists visit_count_offset int not null default 0;

-- 既存データはそのまま（調整なし=0）とし、以後この列を編集すると来店回数に反映されます。
update customers set visit_count_offset = 0 where visit_count_offset is null;

create or replace function recalc_customer_stats() returns trigger
language plpgsql
as $$
declare
  cust_id uuid;
begin
  cust_id := coalesce(new.customer_id, old.customer_id);
  if cust_id is null then
    return coalesce(new, old);
  end if;

  update customers set
    visit_count    = coalesce(visit_count_offset, 0) + (select count(*) from treatment_records where customer_id = cust_id),
    lifetime_value = (select coalesce(sum(amount), 0) from treatment_records where customer_id = cust_id),
    last_visit_on  = (select max(performed_on) from treatment_records where customer_id = cust_id),
    avg_cycle_days = (
      select case when count(*) > 1
        then round((max(performed_on) - min(performed_on))::numeric / (count(*) - 1))::int
        else null end
      from treatment_records where customer_id = cust_id
    )
  where id = cust_id;

  return coalesce(new, old);
end;
$$;
