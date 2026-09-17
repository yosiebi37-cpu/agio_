-- ============================================================================
--  お客様向け予約ページから、スタッフの出勤日・出勤時間だけを見られるようにする
--  （休みの日や、シフトが未登録の日には予約できないようにするため）
-- ============================================================================

create or replace view public_shifts as
  select staff_id, shift_date, start_time, end_time
  from shifts;

grant select on public_shifts to anon;
