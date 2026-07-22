-- ============================================================================
--  agio — 顧客の来店回数・累計売上などを自動更新するトリガー
-- ----------------------------------------------------------------------------
--  Supabase ダッシュボードの SQL Editor にこのファイルを貼り付けて実行してください。
--  一度実行すれば十分です（再実行しても安全です）。
--
--  やること:
--    treatment_records（施術履歴）が追加・変更・削除されるたびに、
--    その顧客の customers.visit_count / lifetime_value / last_visit_on /
--    avg_cycle_days を自動で再計算します。
--    実行後の新規の施術記録から反映されます（過去分もこの実行時に一度再計算されます）。
-- ============================================================================

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
    visit_count    = (select count(*) from treatment_records where customer_id = cust_id),
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

drop trigger if exists trg_recalc_customer_stats on treatment_records;
create trigger trg_recalc_customer_stats
after insert or update or delete on treatment_records
for each row execute function recalc_customer_stats();

-- 既存の施術履歴を元に、今すぐ一度全顧客分を再計算する
update customers c set
  visit_count    = t.cnt,
  lifetime_value = t.total,
  last_visit_on  = t.last_on,
  avg_cycle_days = case when t.cnt > 1
    then round((t.last_on - t.first_on)::numeric / (t.cnt - 1))::int
    else null end
from (
  select customer_id, count(*) as cnt, coalesce(sum(amount), 0) as total,
         max(performed_on) as last_on, min(performed_on) as first_on
  from treatment_records
  group by customer_id
) t
where c.id = t.customer_id;
