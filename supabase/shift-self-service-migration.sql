-- ============================================================================
--  スタッフが自分のシフトだけ確認・入力できるようにする移行スクリプト
--  Supabase の SQL Editor にこのファイルを貼り付けて実行してください。
-- ============================================================================

-- シフトは全員分が見えるが（予約ボードの受付可能数計算に使うため）、
-- 書き込みはオーナー（is_admin）か、本人のシフトのみに限定する
drop policy if exists "staff_authenticated_all" on shifts;
drop policy if exists "shifts_select_all" on shifts;
drop policy if exists "shifts_self_insert" on shifts;
drop policy if exists "shifts_self_update" on shifts;
drop policy if exists "shifts_self_delete" on shifts;

create policy "shifts_select_all" on shifts for select to authenticated using (true);
create policy "shifts_self_insert" on shifts for insert to authenticated with check (is_admin() or staff_id = current_staff_id());
create policy "shifts_self_update" on shifts for update to authenticated using (is_admin() or staff_id = current_staff_id()) with check (is_admin() or staff_id = current_staff_id());
create policy "shifts_self_delete" on shifts for delete to authenticated using (is_admin() or staff_id = current_staff_id());
