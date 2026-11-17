/**
 * 定休日・休業日・臨時営業日の判定
 *
 * - 個別の休業日（holidays）に登録された日 → 休み
 * - 臨時営業日（open_days）に登録された日 → 毎週の定休日の曜日でも営業
 * - それ以外 → 毎週の定休日の曜日なら休み
 */
export function isClosedDate(
  date: string,
  closedWeekdays: readonly number[],
  holidayDates: ReadonlySet<string> | readonly string[],
  openDates: ReadonlySet<string> | readonly string[],
): boolean {
  const has = (s: ReadonlySet<string> | readonly string[], d: string) =>
    s instanceof Set ? s.has(d) : (s as readonly string[]).includes(d);
  if (has(holidayDates, date)) return true;
  if (has(openDates, date)) return false;
  return closedWeekdays.includes(new Date(date + 'T00:00:00').getDay());
}
