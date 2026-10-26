import { describe, it, expect } from 'vitest';
import { monthKey, aggregateMonthlyCustomers, aggregateMonthlyRetail, computeRepeatRates, aggregateAgeBrackets, listNewCustomerNamesByMonth, reclassifyVisitTypes, computeRepeatRatesFromVisits, computeRepeatRatesBySource } from './analytics';

describe('monthKey', () => {
  it('extracts YYYY-MM from an ISO date', () => {
    expect(monthKey('2026-09-17')).toBe('2026-09');
  });
});

describe('aggregateMonthlyCustomers', () => {
  it('counts new/existing visited bookings per month and sums sales', () => {
    const rows = aggregateMonthlyCustomers([
      { booking_date: '2026-08-01', customer_type: 'new', status: 'visited', amount: 5000 },
      { booking_date: '2026-08-15', customer_type: 'existing', status: 'visited', amount: 8000 },
      { booking_date: '2026-09-01', customer_type: 'new', status: 'visited', amount: 6000 },
      { booking_date: '2026-09-02', customer_type: 'new', status: 'confirmed', amount: 6000 },
    ]);
    expect(rows).toEqual([
      { month: '2026-08', newCount: 1, existingCount: 1, treatmentSales: 13000 },
      { month: '2026-09', newCount: 1, existingCount: 0, treatmentSales: 6000 },
    ]);
  });

  it('ignores bookings that are not visited', () => {
    const rows = aggregateMonthlyCustomers([
      { booking_date: '2026-08-01', customer_type: 'new', status: 'confirmed', amount: 5000 },
      { booking_date: '2026-08-02', customer_type: 'new', status: 'tentative', amount: 5000 },
    ]);
    expect(rows).toEqual([]);
  });
});

describe('aggregateMonthlyRetail', () => {
  it('sums retail sales per month', () => {
    const rows = aggregateMonthlyRetail([
      { sale_date: '2026-08-05', amount: 1000 },
      { sale_date: '2026-08-20', amount: 2000 },
      { sale_date: '2026-09-01', amount: 1500 },
    ]);
    expect(rows).toEqual([
      { month: '2026-08', retailSales: 3000 },
      { month: '2026-09', retailSales: 1500 },
    ]);
  });
});

describe('computeRepeatRates', () => {
  it('groups customers by their first visit month and checks if they returned', () => {
    const rows = computeRepeatRates([
      { customer_id: 'a', performed_on: '2026-07-01' },
      { customer_id: 'a', performed_on: '2026-08-01' },
      { customer_id: 'b', performed_on: '2026-07-15' },
      { customer_id: 'c', performed_on: '2026-08-10' },
    ]);
    expect(rows).toEqual([
      { month: '2026-07', newCustomers: 2, returned: 1, repeatRate: 0.5 },
      { month: '2026-08', newCustomers: 1, returned: 0, repeatRate: 0 },
    ]);
  });

  it('ignores records without a customer_id', () => {
    const rows = computeRepeatRates([{ customer_id: '', performed_on: '2026-07-01' }]);
    expect(rows).toEqual([]);
  });

  it('does not count two records on the same day as a return visit', () => {
    const rows = computeRepeatRates([
      { customer_id: 'a', performed_on: '2026-07-01' },
      { customer_id: 'a', performed_on: '2026-07-01' },
    ]);
    expect(rows).toEqual([{ month: '2026-07', newCustomers: 1, returned: 0, repeatRate: 0 }]);
  });
});

describe('listNewCustomerNamesByMonth', () => {
  it('lists names of visited new-customer bookings per month', () => {
    const rows = listNewCustomerNamesByMonth([
      { booking_date: '2026-08-01', customer_type: 'new', status: 'visited', amount: 5000, customer_name: '山田花子' },
      { booking_date: '2026-08-15', customer_type: 'existing', status: 'visited', amount: 8000, customer_name: '田中太郎' },
      { booking_date: '2026-09-01', customer_type: 'new', status: 'visited', amount: 6000, customer_name: '佐藤次郎' },
      { booking_date: '2026-09-02', customer_type: 'new', status: 'confirmed', amount: 6000, customer_name: '鈴木一郎' },
    ]);
    expect(rows).toEqual([
      { month: '2026-08', names: ['山田花子'] },
      { month: '2026-09', names: ['佐藤次郎'] },
    ]);
  });
});

describe('aggregateAgeBrackets', () => {
  it('buckets customers into age brackets by birth year', () => {
    const rows = aggregateAgeBrackets([1990, 1985, 1995, 1960, null, 2010], 2026);
    expect(rows).toEqual([
      { bracket: '10代', count: 1 },
      { bracket: '20代', count: 0 },
      { bracket: '30代', count: 2 },
      { bracket: '40代', count: 1 },
      { bracket: '50代', count: 0 },
      { bracket: '60代以上', count: 1 },
      { bracket: '不明', count: 1 },
    ]);
  });

  it('returns all zero counts for an empty list', () => {
    const rows = aggregateAgeBrackets([]);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });
});

describe('reclassifyVisitTypes', () => {
  const v = (date: string, name: string, type: string, customer_id: string | null = null, status = 'visited') => ({
    booking_date: date, start_time: '10:00', customer_name: name, customer_type: type, customer_id, status, amount: 0,
  });

  it('counts only the first visit of a 新規客 as new', () => {
    const rows = reclassifyVisitTypes(
      [v('2026-08-01', '山田 花子', 'new', 'a'), v('2026-10-01', '山田 花子', 'new', 'a')],
      [{ id: 'a', customer_type: 'new', visit_count_offset: 0 }],
    );
    expect(rows.map((r) => r.customer_type)).toEqual(['new', 'existing']);
  });

  it('treats 既存客 and customers with prior visits outside the system as existing', () => {
    const rows = reclassifyVisitTypes(
      [v('2026-10-01', '田中 太郎', 'new', 'b'), v('2026-10-02', '佐藤 次郎', 'new', 'c')],
      [
        { id: 'b', customer_type: 'existing', visit_count_offset: 0 },
        { id: 'c', customer_type: 'new', visit_count_offset: 2 },
      ],
    );
    expect(rows.map((r) => r.customer_type)).toEqual(['existing', 'existing']);
  });

  it('treats a 新規客 as new on the first visit even if the booking said existing', () => {
    const rows = reclassifyVisitTypes([v('2026-10-01', '鈴木 一郎', 'existing', 'd')], [{ id: 'd', customer_type: 'new' }]);
    expect(rows[0].customer_type).toBe('new');
  });

  it('uses the name for unlinked bookings and duplicated customer records', () => {
    const rows = reclassifyVisitTypes(
      [
        v('2026-08-01', '高橋　リサ', 'new'),
        v('2026-10-01', '高橋 リサ', 'new', 'e'),
        v('2026-10-03', '伊藤 明', 'new'),
      ],
      [{ id: 'e', customer_type: 'new' }],
    );
    expect(rows.map((r) => r.customer_type)).toEqual(['new', 'existing', 'new']);
  });

  it('leaves non-visited bookings untouched and ignores them for first-visit detection', () => {
    const rows = reclassifyVisitTypes(
      [v('2026-08-01', '山田 花子', 'new', 'a', 'confirmed'), v('2026-09-01', '山田 花子', 'new', 'a')],
      [{ id: 'a', customer_type: 'new' }],
    );
    expect(rows.map((r) => r.customer_type)).toEqual(['new', 'new']);
    expect(listNewCustomerNamesByMonth(rows)).toEqual([{ month: '2026-09', names: ['山田 花子'] }]);
  });
});

describe('computeRepeatRatesFromVisits', () => {
  it('uses the same new customers as the list and checks for a later visit', () => {
    const v = (date: string, name: string, type: string, customer_id: string | null = null) => ({
      booking_date: date, customer_name: name, customer_type: type, customer_id, status: 'visited', amount: 0,
    });
    const rows = computeRepeatRatesFromVisits([
      v('2026-07-01', 'A', 'new', 'a'),
      v('2026-07-01', 'A', 'existing', 'a'),
      v('2026-08-01', 'A', 'existing', 'a'),
      v('2026-07-10', 'B', 'new', 'b'),
      v('2026-07-10', 'B', 'existing', 'b'),
      v('2026-08-05', 'C', 'new'),
      v('2026-09-05', 'C', 'existing', 'c'),
      v('2026-08-06', 'D', 'existing', 'd'),
    ]);
    expect(rows).toEqual([
      { month: '2026-07', newCustomers: 2, returned: 1, repeatRate: 0.5 },
      { month: '2026-08', newCustomers: 1, returned: 1, repeatRate: 1 },
    ]);
  });
});

describe('computeRepeatRatesBySource', () => {
  const v = (date: string, name: string, id: string | null, type: 'new' | 'existing', source = 'manual') => ({
    booking_date: date, customer_name: name, customer_id: id, customer_type: type, status: 'visited', amount: 0, source,
  });
  const opts = { today: '2026-10-26', sourceOrder: ['ホットペッパー', 'Instagram', '紹介'], unknownLabel: '未入力', hotpepperLabel: 'ホットペッパー', matureDays: 60 };

  it('顧客管理の来店経路ごとに新規客と再来率を出し、未入力は最後にまとめる', () => {
    const rows = computeRepeatRatesBySource(
      [
        v('2026-06-01', 'A', 'a', 'new'),
        v('2026-07-15', 'A', 'a', 'existing'),
        v('2026-06-10', 'B', 'b', 'new'),
        v('2026-06-12', 'C', 'c', 'new'),
        v('2026-10-20', 'D', 'd', 'new'),
      ],
      new Map([['a', '紹介'], ['b', '紹介'], ['c', null], ['d', 'Instagram']]),
      opts,
    );
    expect(rows.map((r) => r.source)).toEqual(['Instagram', '紹介', '未入力']);
    const intro = rows.find((r) => r.source === '紹介')!;
    expect(intro.newCustomers).toBe(2);
    expect(intro.returned).toBe(1);
    expect(intro.repeatRate).toBe(0.5);
    expect(intro.matureRepeatRate).toBe(0.5);
    const insta = rows.find((r) => r.source === 'Instagram')!;
    expect(insta.matureNewCustomers).toBe(0);
    expect(insta.matureRepeatRate).toBeNull();
  });

  it('来店経路が未入力でも、初回予約がホットペッパー経由ならホットペッパーに数える', () => {
    const rows = computeRepeatRatesBySource(
      [v('2026-06-01', 'A', 'a', 'new', 'hotpepper'), v('2026-07-01', 'A', 'a', 'existing', 'manual')],
      new Map([['a', null]]),
      opts,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('ホットペッパー');
    expect(rows[0].repeatRate).toBe(1);
  });

  it('同じ名前の重複登録は同じ人とみなし、どちらかに入力された来店経路を使う', () => {
    const rows = computeRepeatRatesBySource(
      [v('2026-06-01', '山田 花子', 'x1', 'new'), v('2026-07-01', '山田花子', 'x2', 'existing')],
      new Map([['x1', null], ['x2', '紹介']]),
      opts,
    );
    expect(rows).toEqual([expect.objectContaining({ source: '紹介', newCustomers: 1, returned: 1 })]);
  });
});
