// 分析ページ用の集計ロジック（サーバー側でも単体テストからも使えるよう純粋関数にしている）

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export const monthKey = (dateStr: string): string => dateStr.slice(0, 7);

export interface BookingRow {
  booking_date: string;
  customer_type: string;
  status: string;
  amount: number;
}

export interface MonthlyCustomerRow {
  month: string;
  newCount: number;
  existingCount: number;
  treatmentSales: number;
}

/** 来店済み予約を月ごとに集計し、新規客数・既存客数・施術売上を出す */
export function aggregateMonthlyCustomers(bookings: BookingRow[]): MonthlyCustomerRow[] {
  const map = new Map<string, MonthlyCustomerRow>();
  for (const b of bookings) {
    if (b.status !== 'visited') continue;
    const month = monthKey(b.booking_date);
    const row = map.get(month) ?? { month, newCount: 0, existingCount: 0, treatmentSales: 0 };
    if (b.customer_type === 'new') row.newCount += 1;
    else row.existingCount += 1;
    row.treatmentSales += b.amount ?? 0;
    map.set(month, row);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface RetailSaleRow {
  sale_date: string;
  amount: number;
}

export interface MonthlyRetailRow {
  month: string;
  retailSales: number;
}

/** 店販売上を月ごとに集計する */
export function aggregateMonthlyRetail(retailSales: RetailSaleRow[]): MonthlyRetailRow[] {
  const map = new Map<string, number>();
  for (const r of retailSales) {
    const month = monthKey(r.sale_date);
    map.set(month, (map.get(month) ?? 0) + (r.amount ?? 0));
  }
  return Array.from(map.entries())
    .map(([month, retailSales]) => ({ month, retailSales }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface TreatmentRecordRow {
  customer_id: string;
  performed_on: string;
}

export interface RepeatRow {
  month: string;
  newCustomers: number;
  returned: number;
  /** その月に新規で来店した人のうち、現時点までにもう一度来店した割合（0〜1）。newCustomers が 0 の月は null */
  repeatRate: number | null;
}

/**
 * 施術記録（お客様に紐づくもののみ）から、月ごとの新規客のうち
 * その後もう一度来店した人の割合を計算する。
 * 施術記録が顧客に紐づいていない予約（一部のホットペッパー・Square経由の予約など）は集計対象外。
 */
export function computeRepeatRates(records: TreatmentRecordRow[]): RepeatRow[] {
  const byCustomer = new Map<string, string[]>();
  for (const r of records) {
    if (!r.customer_id) continue;
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r.performed_on);
    byCustomer.set(r.customer_id, list);
  }

  const monthMap = new Map<string, { newCustomers: number; returned: number }>();
  for (const dates of byCustomer.values()) {
    const sorted = [...dates].sort();
    const firstMonth = monthKey(sorted[0]);
    const hasReturned = sorted.length > 1;
    const row = monthMap.get(firstMonth) ?? { newCustomers: 0, returned: 0 };
    row.newCustomers += 1;
    if (hasReturned) row.returned += 1;
    monthMap.set(firstMonth, row);
  }

  return Array.from(monthMap.entries())
    .map(([month, v]) => ({
      month,
      newCustomers: v.newCustomers,
      returned: v.returned,
      repeatRate: v.newCustomers > 0 ? v.returned / v.newCustomers : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
