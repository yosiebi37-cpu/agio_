import { describe, it, expect } from 'vitest';
import { monthKey, aggregateMonthlyCustomers, aggregateMonthlyRetail, computeRepeatRates, aggregateAgeBrackets, listNewCustomerNamesByMonth } from './analytics';

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
