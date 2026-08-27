-- スタッフ用アカウント（staff.user_id で紐付いたスタッフ）は、
-- 自分の予約・顧客対応はできるが、他人の報酬や店舗設定は見られないようにする
-- 既存プロジェクトに1度だけ適用するマイグレーション（staff-user-link.sql の後に実行してください）

create or replace function current_staff_id() returns uuid
language sql stable
as $$
  select id from staff where user_id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable
as $$
  select auth.uid() is not null and current_staff_id() is null;
$$;

do $$
declare t text;
begin
  foreach t in array array['staff', 'commission_settings', 'menu_items', 'salon_settings', 'holidays', 'expenses']
  loop
    execute format('drop policy if exists "staff_authenticated_all" on %I;', t);
    execute format('drop policy if exists "%1$s_select_all" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_insert" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_update" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_delete" on %1$I;', t);
    execute format('create policy "%1$s_select_all" on %1$I for select to authenticated using (true);', t);
    execute format('create policy "%1$s_admin_insert" on %1$I for insert to authenticated with check (is_admin());', t);
    execute format('create policy "%1$s_admin_update" on %1$I for update to authenticated using (is_admin()) with check (is_admin());', t);
    execute format('create policy "%1$s_admin_delete" on %1$I for delete to authenticated using (is_admin());', t);
  end loop;

  foreach t in array array['freelance_daily_sales', 'retail_sales']
  loop
    execute format('drop policy if exists "staff_authenticated_all" on %I;', t);
    execute format('drop policy if exists "%1$s_select_own" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_insert" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_update" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_delete" on %1$I;', t);
    execute format('create policy "%1$s_select_own" on %1$I for select to authenticated using (is_admin() or staff_id = current_staff_id());', t);
    execute format('create policy "%1$s_admin_insert" on %1$I for insert to authenticated with check (is_admin());', t);
    execute format('create policy "%1$s_admin_update" on %1$I for update to authenticated using (is_admin()) with check (is_admin());', t);
    execute format('create policy "%1$s_admin_delete" on %1$I for delete to authenticated using (is_admin());', t);
  end loop;
end $$;
