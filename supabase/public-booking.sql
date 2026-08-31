-- お客様向け予約ページ（未ログインの一般公開）用の設定
-- メニュー・スタッフ・空き状況だけを安全に公開し、予約の作成だけを許可する
-- 既存プロジェクトに1度だけ適用するマイグレーション

alter table menu_items
  add column if not exists duration_minutes int not null default 60;

create or replace view public_staff as
  select id, name, initials, color, bg_color, fg_color, employment_type, is_active, sort_order
  from staff
  where is_active = true;

create or replace view public_availability as
  select staff_id, booking_date, start_time, end_time
  from bookings;

grant select on public_staff to anon;
grant select on public_availability to anon;
grant select on menu_items to anon;
grant select on salon_settings to anon;
grant select on holidays to anon;

drop policy if exists "public_menu_items_select" on menu_items;
create policy "public_menu_items_select" on menu_items for select to anon using (is_active = true);

drop policy if exists "public_salon_settings_select" on salon_settings;
create policy "public_salon_settings_select" on salon_settings for select to anon using (true);

drop policy if exists "public_holidays_select" on holidays;
create policy "public_holidays_select" on holidays for select to anon using (true);

drop policy if exists "public_customer_insert" on customers;
create policy "public_customer_insert" on customers for insert to anon with check (true);

drop policy if exists "public_booking_insert" on bookings;
create policy "public_booking_insert" on bookings for insert to anon with check (true);

create or replace function public_find_customer_by_phone(p_phone text)
returns table(id uuid, name text, customer_type text)
language sql security definer
set search_path = public
as $$
  select id, name, customer_type from customers where phone = p_phone limit 1;
$$;

grant execute on function public_find_customer_by_phone(text) to anon;
