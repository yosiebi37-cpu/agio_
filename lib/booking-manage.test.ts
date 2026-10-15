import { describe, it, expect } from 'vitest';
import {
  jstNow,
  canModifyBooking,
  computeAvailableStarts,
  filterFutureStarts,
  type AvailabilityInput,
} from './booking-manage';

// 日本時間 'YYYY-MM-DD HH:MM' から、その瞬間のミリ秒を作る
const jstMs = (date: string, time: string): number => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, m) - 9 * 60 * 60 * 1000;
};

describe('jstNow', () => {
  it('converts a UTC instant to the Japan date and minutes', () => {
    // UTC 2026-10-01 20:30 は 日本時間 2026-10-02 05:30
    expect(jstNow(Date.UTC(2026, 9, 1, 20, 30))).toEqual({ date: '2026-10-02', minutes: 5 * 60 + 30 });
  });
});

describe('canModifyBooking', () => {
  it('allows changes until 18:00 the day before', () => {
    expect(canModifyBooking('2026-10-10', jstMs('2026-10-09', '17:59'))).toBe(true);
    expect(canModifyBooking('2026-10-10', jstMs('2026-10-09', '18:00'))).toBe(true);
  });
  it('rejects changes after 18:00 the day before', () => {
    expect(canModifyBooking('2026-10-10', jstMs('2026-10-09', '18:01'))).toBe(false);
    expect(canModifyBooking('2026-10-10', jstMs('2026-10-10', '08:00'))).toBe(false);
  });
});

const baseInput = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  durationMinutes: 60,
  closed: false,
  shift: { start_time: '10:00:00', end_time: '13:00:00' },
  staffBusy: [],
  allBookings: [],
  capacityOverrides: new Map(),
  allShifts: [
    { staff_id: 'a', start_time: '10:00:00', end_time: '13:00:00' },
    { staff_id: 'b', start_time: '10:00:00', end_time: '13:00:00' },
  ],
  freeStaffIds: new Set(),
  ...over,
});

describe('computeAvailableStarts', () => {
  it('lists every 30-minute start that fits inside the shift', () => {
    expect(computeAvailableStarts(baseInput())).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00']);
  });

  it('returns nothing on closed days or when the staff does not work', () => {
    expect(computeAvailableStarts(baseInput({ closed: true }))).toEqual([]);
    expect(computeAvailableStarts(baseInput({ shift: null }))).toEqual([]);
  });

  it('skips times that overlap the staff member\'s other bookings', () => {
    const starts = computeAvailableStarts(baseInput({ staffBusy: [{ start_time: '11:00:00', end_time: '12:00:00' }] }));
    expect(starts).toEqual(['10:00', '12:00']);
  });

  it('skips times when the whole salon is at capacity', () => {
    // 2人出勤しているが、11:00〜12:00に2件の予約があるため、その時間帯は新たに入れられない
    const starts = computeAvailableStarts(
      baseInput({
        allBookings: [
          { start_time: '11:00:00', end_time: '12:00:00' },
          { start_time: '11:00:00', end_time: '12:00:00' },
        ],
      }),
    );
    expect(starts).toEqual(['10:00', '12:00']);
  });

  it('does not count the free (placeholder) staff as capacity', () => {
    const starts = computeAvailableStarts(
      baseInput({
        allShifts: [
          { staff_id: 'a', start_time: '10:00:00', end_time: '13:00:00' },
          { staff_id: 'free', start_time: '10:00:00', end_time: '13:00:00' },
        ],
        freeStaffIds: new Set(['free']),
        allBookings: [{ start_time: '10:00:00', end_time: '11:00:00' }],
      }),
    );
    expect(starts).toEqual(['11:00', '11:30', '12:00']);
  });

  it('uses manual capacity overrides over the shift count', () => {
    // 11:00〜11:30の枠だけ受付可能数を0にすると、その枠にかかる10:30・11:00開始だけが入れられなくなる
    const starts = computeAvailableStarts(baseInput({ capacityOverrides: new Map([[11 * 60, 0]]) }));
    expect(starts).toEqual(['10:00', '11:30', '12:00']);
  });
});

describe('filterFutureStarts', () => {
  const now = { date: '2026-10-10', minutes: 11 * 60 };
  it('drops everything on past dates', () => {
    expect(filterFutureStarts(['10:00', '12:00'], '2026-10-09', now)).toEqual([]);
  });
  it('drops times that have already started today', () => {
    expect(filterFutureStarts(['10:00', '11:00', '12:00'], '2026-10-10', now)).toEqual(['12:00']);
  });
  it('keeps every time on future dates', () => {
    expect(filterFutureStarts(['10:00', '12:00'], '2026-10-11', now)).toEqual(['10:00', '12:00']);
  });
});
