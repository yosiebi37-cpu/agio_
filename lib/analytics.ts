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
    // 同じ日に施術記録が2件（重複入力）あっても、再来店とは数えない
    const hasReturned = new Set(sorted).size > 1;
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

export interface VisitBookingRow extends BookingRow {
  customer_name: string;
  customer_id?: string | null;
  start_time?: string | null;
}

export interface CustomerTypeRow {
  id: string;
  customer_type: string;
  visit_count_offset?: number | null;
}

/** 名前の空白（全角・半角）を除いて比較用のキーにする */
const nameKey = (name: string): string => (name ?? '').replace(/[\s\u3000]+/g, '');

/**
 * 予約ごとに付いている「新規/既存」ではなく、お客様単位で新規来店を判定し直す。
 *
 * 予約の customer_type は予約時の自己申告やホットペッパーの区分がそのまま入るため、
 * 2回目以降の来店や既存客の予約にも 'new' が付いていることがある。そこで、
 *  - 顧客管理で「既存客」になっているお客様（または来店回数の手動調整があるお客様）は常に既存客
 *  - それ以外は、そのお客様の最初の来店（来店済みの予約のうち一番早いもの）だけを新規客、2回目以降は既存客
 *  - お客様情報に紐付いていない予約は、予約の区分が 'new' で、同じ名前の来店がそれより前にない場合だけ新規客
 * として customer_type を付け直した予約一覧を返す（来店済み以外の予約はそのまま）。
 * 同じ名前の来店が前にあれば、別の顧客レコード（重複登録）でも再来として扱う。
 */
export function reclassifyVisitTypes<T extends VisitBookingRow>(bookings: T[], customers: CustomerTypeRow[]): T[] {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const visited = bookings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.status === 'visited')
    .sort((x, y) =>
      x.b.booking_date.localeCompare(y.b.booking_date) ||
      (x.b.start_time ?? '').localeCompare(y.b.start_time ?? '') ||
      x.i - y.i,
    );

  const seenCustomerIds = new Set<string>();
  const seenNames = new Set<string>();
  const result = [...bookings];
  for (const { b, i } of visited) {
    const key = nameKey(b.customer_name);
    const customer = b.customer_id ? customerMap.get(b.customer_id) : undefined;
    const isFirstVisit =
      (!b.customer_id || !seenCustomerIds.has(b.customer_id)) && (key === '' || !seenNames.has(key));

    let isNew: boolean;
    if (customer) {
      const hasPriorVisits = (customer.visit_count_offset ?? 0) > 0;
      isNew = customer.customer_type === 'new' && !hasPriorVisits && isFirstVisit;
    } else {
      isNew = b.customer_type === 'new' && isFirstVisit;
    }

    if (b.customer_id) seenCustomerIds.add(b.customer_id);
    if (key) seenNames.add(key);
    result[i] = { ...b, customer_type: isNew ? 'new' : 'existing' };
  }
  return result;
}

/**
 * reclassifyVisitTypes で付け直した予約から、月ごとの新規客のうち
 * その後もう一度（別の日に）来店した人の割合を出す。
 * 新規客一覧・新規客数と同じ人を対象にするため、カルテの有無には左右されない。
 */
export function computeRepeatRatesFromVisits(bookings: VisitBookingRow[]): RepeatRow[] {
  const visited = bookings.filter((b) => b.status === 'visited');

  // 同じ人の来店をまとめるキー（名前が同じなら顧客レコードが分かれていても同じ人とみなす）
  const idToPerson = new Map<string, string>();
  const nameToPerson = new Map<string, string>();
  const personOf = (b: VisitBookingRow): string => {
    const key = nameKey(b.customer_name);
    const existing = (b.customer_id && idToPerson.get(b.customer_id)) || (key && nameToPerson.get(key)) || undefined;
    const person = existing ?? (b.customer_id ? `id:${b.customer_id}` : `name:${key}`);
    if (b.customer_id) idToPerson.set(b.customer_id, person);
    if (key) nameToPerson.set(key, person);
    return person;
  };

  const sorted = [...visited].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const firstNew = new Map<string, string>(); // person -> 新規来店日
  const datesByPerson = new Map<string, Set<string>>();
  for (const b of sorted) {
    const person = personOf(b);
    const dates = datesByPerson.get(person) ?? new Set<string>();
    dates.add(b.booking_date);
    datesByPerson.set(person, dates);
    if (b.customer_type === 'new' && !firstNew.has(person)) firstNew.set(person, b.booking_date);
  }

  const monthMap = new Map<string, { newCustomers: number; returned: number }>();
  for (const [person, firstDate] of firstNew) {
    const month = monthKey(firstDate);
    const row = monthMap.get(month) ?? { newCustomers: 0, returned: 0 };
    row.newCustomers += 1;
    const dates = datesByPerson.get(person) ?? new Set<string>();
    if ([...dates].some((d) => d > firstDate)) row.returned += 1;
    monthMap.set(month, row);
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
