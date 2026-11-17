import { describe, it, expect } from 'vitest';
import { isClosedDate } from './closures';

describe('isClosedDate', () => {
  const mondays = [1];
  it('毎週の定休日の曜日は休み', () => {
    expect(isClosedDate('2026-12-21', mondays, [], [])).toBe(true);
  });
  it('臨時営業日に登録すれば定休日の曜日でも営業', () => {
    expect(isClosedDate('2026-12-28', mondays, [], ['2026-12-28'])).toBe(false);
    expect(isClosedDate('2026-12-28', mondays, new Set<string>(), new Set(['2026-12-28']))).toBe(false);
  });
  it('個別の休業日は臨時営業日より優先して休み', () => {
    expect(isClosedDate('2026-12-31', mondays, ['2026-12-31'], ['2026-12-31'])).toBe(true);
  });
  it('ふつうの営業日は営業', () => {
    expect(isClosedDate('2026-12-29', mondays, [], [])).toBe(false);
  });
});
