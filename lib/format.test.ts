import { describe, it, expect } from 'vitest';
import {
  yen,
  yenK,
  hhmm,
  toMinutes,
  formatDateShort,
  formatDateLong,
  formatDateSlash,
  toISODate,
  addDays,
  startOfWeek,
  formatMonthLong,
  formatDateTiny,
  initialsFromName,
  datesInRangeByWeekday,
  hiraganaToKatakana,
  minutesToHHMM,
} from './format';

describe('yen', () => {
  it('formats a number with the yen sign and thousands separators', () => {
    expect(yen(1234500)).toBe('¥1,234,500');
  });
  it('treats null/undefined as 0', () => {
    expect(yen(null)).toBe('¥0');
    expect(yen(undefined)).toBe('¥0');
  });
});

describe('yenK', () => {
  it('rounds to the nearest thousand yen', () => {
    expect(yenK(336000)).toBe('¥336k');
    expect(yenK(1499)).toBe('¥1k');
  });
});

describe('hhmm', () => {
  it('truncates seconds from a time string', () => {
    expect(hhmm('09:30:00')).toBe('09:30');
    expect(hhmm('09:30')).toBe('09:30');
  });
});

describe('toMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('01:30')).toBe(90);
    expect(toMinutes('23:59')).toBe(1439);
  });
});

describe('date formatters', () => {
  it('formatDateShort omits the year', () => {
    expect(formatDateShort('2026-05-30')).toBe('5月30日（土）');
  });
  it('formatDateLong includes the year', () => {
    expect(formatDateLong('2026-05-30')).toBe('2026年5月30日（土）');
  });
  it('formatDateSlash uses slash separators and pads single digits', () => {
    expect(formatDateSlash('2026-05-30')).toBe('2026/05/30');
    expect(formatDateSlash('2026-01-05')).toBe('2026/01/05');
  });
  it('formatDateSlash returns a dash for null', () => {
    expect(formatDateSlash(null)).toBe('—');
  });
  it('formatMonthLong', () => {
    expect(formatMonthLong('2026-07')).toBe('2026年7月');
  });
  it('formatDateTiny', () => {
    expect(formatDateTiny('2026-07-18')).toBe('7/18(土)');
  });
});

describe('toISODate', () => {
  it('formats a Date as YYYY-MM-DD with zero padding', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-07-01', 5)).toBe('2026-07-06');
  });
  it('rolls over into the next month', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
  });
  it('supports negative deltas', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30');
  });
});

describe('startOfWeek', () => {
  it('returns the same date when it is already Sunday', () => {
    // 2026-07-19 is a Sunday
    expect(startOfWeek('2026-07-19')).toBe('2026-07-19');
  });
  it('returns the preceding Sunday for a mid-week date', () => {
    // 2026-07-22 is a Wednesday
    expect(startOfWeek('2026-07-22')).toBe('2026-07-19');
  });
});

describe('initialsFromName', () => {
  it('takes the first character of each space-separated part', () => {
    expect(initialsFromName('山田 花子')).toBe('山花');
  });
  it('falls back to the first two characters when there is no space', () => {
    expect(initialsFromName('山田花子')).toBe('山田');
  });
  it('trims surrounding whitespace', () => {
    expect(initialsFromName('  田中 京子  ')).toBe('田京');
  });
});

describe('datesInRangeByWeekday', () => {
  it('returns only dates matching the requested weekdays', () => {
    // 2026-07-19 is a Sunday, 2026-07-25 is a Saturday
    const mondaysAndWednesdays = datesInRangeByWeekday('2026-07-19', '2026-07-25', new Set([1, 3]));
    expect(mondaysAndWednesdays).toEqual(['2026-07-20', '2026-07-22']);
  });
  it('includes both endpoints when they match', () => {
    const sundays = datesInRangeByWeekday('2026-07-19', '2026-07-26', new Set([0]));
    expect(sundays).toEqual(['2026-07-19', '2026-07-26']);
  });
  it('returns an empty array when no weekdays are selected', () => {
    expect(datesInRangeByWeekday('2026-07-19', '2026-07-25', new Set())).toEqual([]);
  });
  it('returns an empty array when the range is inverted', () => {
    expect(datesInRangeByWeekday('2026-07-25', '2026-07-19', new Set([0, 1, 2, 3, 4, 5, 6]))).toEqual([]);
  });
});

describe('minutesToHHMM', () => {
  it('formats minutes since midnight as HH:MM', () => {
    expect(minutesToHHMM(540)).toBe('09:00');
    expect(minutesToHHMM(1230)).toBe('20:30');
  });
  it('pads single-digit hours and minutes', () => {
    expect(minutesToHHMM(65)).toBe('01:05');
  });
});

describe('hiraganaToKatakana', () => {
  it('converts hiragana characters to katakana', () => {
    expect(hiraganaToKatakana('やまだ')).toBe('ヤマダ');
  });
  it('leaves non-hiragana characters untouched', () => {
    expect(hiraganaToKatakana('やまだ はなこ123')).toBe('ヤマダ ハナコ123');
  });
  it('handles an empty string', () => {
    expect(hiraganaToKatakana('')).toBe('');
  });
});
