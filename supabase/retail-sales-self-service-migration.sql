-- 店販を、予約ボードからスタッフ自身が自分の担当分として登録できるようにする
-- （これまでは店販の登録がオーナー（管理者）アカウントしかできず、
-- 　スタッフアカウントでログイン中は「new row violates row-level security policy」
-- 　というエラーが出て店販を追加できなかった）

do $$
declare t text;
begin
  foreach t in array array['retail_sales']
  loop
    execute format('drop policy if exists "%1$s_admin_insert" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_update" on %1$I;', t);
    execute format('drop policy if exists "%1$s_admin_delete" on %1$I;', t);
    execute format('drop policy if exists "%1$s_self_insert" on %1$I;', t);
    execute format('drop policy if exists "%1$s_self_update" on %1$I;', t);
    execute format('drop policy if exists "%1$s_self_delete" on %1$I;', t);
    execute format('create policy "%1$s_self_insert" on %1$I for insert to authenticated with check (is_admin() or staff_id = current_staff_id());', t);
    execute format('create policy "%1$s_self_update" on %1$I for update to authenticated using (is_admin() or staff_id = current_staff_id()) with check (is_admin() or staff_id = current_staff_id());', t);
    execute format('create policy "%1$s_self_delete" on %1$I for delete to authenticated using (is_admin() or staff_id = current_staff_id());', t);
  end loop;
end $$;
