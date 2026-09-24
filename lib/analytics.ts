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

export interface NewCustomerNameRow {
  month: string;
  names: string[];
}

/**
 * 来店済み・新規客の予約を月ごとにまとめ、お客様名の一覧を出す。
 * aggregateMonthlyCustomers の newCount と同じ数え方（予約1件＝1人分。
 * 同じ人が同じ月に複数回「新規客」として記録されている場合はそのまま複数件表示される）。
 */
export function listNewCustomerNamesByMonth(bookings: (BookingRow & { customer_name: string })[]): NewCustomerNameRow[] {
  const map = new Map<string, string[]>();
  for (const b of bookings) {
    if (b.status !== 'visited' || b.customer_type !== 'new') continue;
    const month = monthKey(b.booking_date);
    const list = map.get(month) ?? [];
    list.push(b.customer_name);
    map.set(month, list);
  }
  return Array.from(map.entries())
    .map(([month, names]) => ({ month, names }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface AgeBracketRow {
  bracket: string;
  count: number;
}

const AGE_BRACKET_ORDER = ['10代', '20代', '30代', '40代', '50代', '60代以上', '不明'];

/** 生まれ年の一覧（未入力は null）から、年齢層ごとの人数を集計する */
export function aggregateAgeBrackets(birthYears: (number | null)[], referenceYear = new Date().getFullYear()): AgeBracketRow[] {
  const counts = new Map<string, number>(AGE_BRACKET_ORDER.map((b) => [b, 0]));
  for (const y of birthYears) {
    let bracket: string;
    if (!y) {
      bracket = '不明';
    } else {
      const age = referenceYear - y;
      if (age < 20) bracket = '10代';
      else if (age < 30) bracket = '20代';
      else if (age < 40) bracket = '30代';
      else if (age < 50) bracket = '40代';
      else if (age < 60) bracket = '50代';
      else bracket = '60代以上';
    }
    counts.set(bracket, (counts.get(bracket) ?? 0) + 1);
  }
  return AGE_BRACKET_ORDER.map((bracket) => ({ bracket, count: counts.get(bracket) ?? 0 }));
}
