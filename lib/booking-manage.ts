import { jstToUtcIso } from '@/lib/square';
import { addDays, minutesToHHMM, toMinutes } from '@/lib/format';

/** 営業時間と枠の刻み（お客様向け予約ページ BookClient / book-submit と同じ値） */
export const OPEN_MIN = 9 * 60;
export const CLOSE_MIN = 20 * 60;
export const SLOT_STEP = 30;

/** お客様が予約の変更・キャンセルをできるのは、予約日の何日前の何時までか */
export const MODIFY_DEADLINE_DAYS_BEFORE = 1;
export const MODIFY_DEADLINE_HOUR = 18;

export interface TimeRange {
  start_time: string;
  end_time: string;
}

export interface ShiftRow extends TimeRange {
  staff_id: string;
}

/** 現在時刻（ミリ秒）を、日本時間の「日付」と「0時からの経過分」に直す */
export function jstNow(nowMs: number): { date: string; minutes: number } {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return { date: `${y}-${mo}-${d}`, minutes: jst.getUTCHours() * 60 + jst.getUTCMinutes() };
}

/** 予約日に対する、お客様が変更・キャンセルできる締め切り時刻（ミリ秒） */
export function modifyDeadlineMs(bookingDate: string): number {
  const deadlineDate = addDays(bookingDate, -MODIFY_DEADLINE_DAYS_BEFORE);
  return new Date(jstToUtcIso(deadlineDate, `${String(MODIFY_DEADLINE_HOUR).padStart(2, '0')}:00`)).getTime();
}

export function canModifyBooking(bookingDate: string, nowMs: number): boolean {
  return nowMs <= modifyDeadlineMs(bookingDate);
}

export interface AvailabilityInput {
  durationMinutes: number;
  /** 定休日・休業日 */
  closed: boolean;
  /** 担当スタッフのその日のシフト（出勤していなければ null） */
  shift: TimeRange | null;
  /** 担当スタッフのその日の他の予約 */
  staffBusy: TimeRange[];
  /** お店全体のその日の予約（受付可能数の判定用） */
  allBookings: TimeRange[];
  /** 手動で設定された30分枠ごとの受付可能数（キーは0時からの分） */
  capacityOverrides: Map<number, number>;
  /** その日の全スタッフのシフト */
  allShifts: ShiftRow[];
  /** 「フリー」（実際の人員ではない仮の枠）のスタッフID */
  freeStaffIds: Set<string>;
}

/** [bStart, bEnd) にシフトが入っているスタッフの人数（「フリー」を除く） */
function shiftBookableCount(bStart: number, bEnd: number, shifts: ShiftRow[], freeStaffIds: Set<string>): number {
  const working = new Set(
    shifts
      .filter((sh) => !freeStaffIds.has(sh.staff_id) && toMinutes(sh.start_time) <= bStart && toMinutes(sh.end_time) >= bEnd)
      .map((sh) => sh.staff_id),
  );
  return working.size;
}

/** お客様向け予約ページと同じルールで、予約を開始できる時刻（HH:MM）の一覧を返す */
export function computeAvailableStarts(input: AvailabilityInput): string[] {
  if (input.closed || !input.shift) return [];
  const openMin = Math.max(OPEN_MIN, toMinutes(input.shift.start_time));
  const closeMin = Math.min(CLOSE_MIN, toMinutes(input.shift.end_time));
  const starts: string[] = [];
  for (let t = openMin; t + input.durationMinutes <= closeMin; t += SLOT_STEP) {
    const end = t + input.durationMinutes;
    const staffOverlaps = input.staffBusy.some((b) => toMinutes(b.start_time) < end && toMinutes(b.end_time) > t);
    if (staffOverlaps) continue;

    let capacityOk = true;
    const firstBucket = Math.floor(t / SLOT_STEP) * SLOT_STEP;
    const lastBucket = Math.floor((end - 1) / SLOT_STEP) * SLOT_STEP;
    for (let bStart = firstBucket; bStart <= lastBucket; bStart += SLOT_STEP) {
      const bEnd = bStart + SLOT_STEP;
      const count = input.allBookings.filter((b) => toMinutes(b.start_time) < bEnd && toMinutes(b.end_time) > bStart).length;
      const capacity = input.capacityOverrides.get(bStart) ?? shiftBookableCount(bStart, bEnd, input.allShifts, input.freeStaffIds);
      if (count >= capacity) {
        capacityOk = false;
        break;
      }
    }
    if (capacityOk) starts.push(minutesToHHMM(t));
  }
  return starts;
}

/** 現在より前の時刻になる枠を取り除く */
export function filterFutureStarts(starts: string[], date: string, now: { date: string; minutes: number }): string[] {
  if (date < now.date) return [];
  if (date > now.date) return starts;
  return starts.filter((s) => toMinutes(s) > now.minutes);
}
