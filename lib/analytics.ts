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
  /** 予約の取り込み元（'manual' | 'hotpepper' | 'square'） */
  source?: string | null;
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

interface NewCustomerCohort {
  /** 新規来店した日（YYYY-MM-DD） */
  firstDate: string;
  /** 新規来店した予約 */
  firstBooking: VisitBookingRow;
  /** 同じ人とみなした予約に付いている顧客ID（重複登録で複数になることがある） */
  customerIds: string[];
  /** 新規来店より後の日に、もう一度来店しているか */
  returned: boolean;
}

/**
 * reclassifyVisitTypes で付け直した予約から、新規で来店したお客様ごとに
 * 「初回来店日」と「その後もう一度（別の日に）来店したか」をまとめる。
 * 名前が同じなら顧客レコードが分かれていても同じ人とみなす。
 */
function collectNewCustomerCohorts(bookings: VisitBookingRow[]): NewCustomerCohort[] {
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
  const firstNew = new Map<string, VisitBookingRow>(); // person -> 新規来店の予約
  const datesByPerson = new Map<string, Set<string>>();
  const idsByPerson = new Map<string, Set<string>>();
  for (const b of sorted) {
    const person = personOf(b);
    const dates = datesByPerson.get(person) ?? new Set<string>();
    dates.add(b.booking_date);
    datesByPerson.set(person, dates);
    if (b.customer_id) {
      const ids = idsByPerson.get(person) ?? new Set<string>();
      ids.add(b.customer_id);
      idsByPerson.set(person, ids);
    }
    if (b.customer_type === 'new' && !firstNew.has(person)) firstNew.set(person, b);
  }

  return Array.from(firstNew.entries()).map(([person, firstBooking]) => {
    const firstDate = firstBooking.booking_date;
    const dates = datesByPerson.get(person) ?? new Set<string>();
    const ids = idsByPerson.get(person) ?? new Set<string>();
    // 新規来店の予約の顧客IDを先頭にする（来店経路はこのIDのものを優先して使う）
    const customerIds = [
      ...(firstBooking.customer_id ? [firstBooking.customer_id] : []),
      ...[...ids].filter((id) => id !== firstBooking.customer_id),
    ];
    return { firstDate, firstBooking, customerIds, returned: [...dates].some((d) => d > firstDate) };
  });
}

/**
 * reclassifyVisitTypes で付け直した予約から、月ごとの新規客のうち
 * その後もう一度（別の日に）来店した人の割合を出す。
 * 新規客一覧・新規客数と同じ人を対象にするため、カルテの有無には左右されない。
 */
export function computeRepeatRatesFromVisits(bookings: VisitBookingRow[]): RepeatRow[] {
  const monthMap = new Map<string, { newCustomers: number; returned: number }>();
  for (const c of collectNewCustomerCohorts(bookings)) {
    const month = monthKey(c.firstDate);
    const row = monthMap.get(month) ?? { newCustomers: 0, returned: 0 };
    row.newCustomers += 1;
    if (c.returned) row.returned += 1;
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

export interface SourceRepeatRow {
  source: string;
  newCustomers: number;
  returned: number;
  /** 全期間の再来率（0〜1）。newCustomers が 0 なら null */
  repeatRate: number | null;
  /** 初回来店から matureDays 日以上たった新規客の数 */
  matureNewCustomers: number;
  matureReturned: number;
  /** 初回来店から matureDays 日以上たった新規客だけで見た再来率（0〜1）。対象が 0 人なら null */
  matureRepeatRate: number | null;
}

/** 'YYYY-MM-DD' に日数を足した日付を 'YYYY-MM-DD' で返す */
const addDays = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * 来店経路（顧客管理で入力したもの）ごとに、新規客の数と再来率を出す。
 * 来店経路が未入力でも、新規来店の予約がホットペッパー経由なら「ホットペッパー」とみなす。
 * それ以外の未入力は unknownLabel にまとめる。
 * 初回来店から日が浅い人は再来率が低く出るため、matureDays 日以上たった人だけの再来率も一緒に出す。
 */
export function computeRepeatRatesBySource(
  bookings: VisitBookingRow[],
  customerSources: Map<string, string | null>,
  options: { today: string; sourceOrder: string[]; unknownLabel: string; hotpepperLabel: string; matureDays?: number },
): SourceRepeatRow[] {
  const matureDays = options.matureDays ?? 60;
  const matureCutoff = addDays(options.today, -matureDays);
  const map = new Map<string, { newCustomers: number; returned: number; matureNewCustomers: number; matureReturned: number }>();

  for (const c of collectNewCustomerCohorts(bookings)) {
    const entered = c.customerIds.map((id) => customerSources.get(id)).find((s) => s && s.trim());
    const source = entered?.trim()
      ?? (c.firstBooking.source === 'hotpepper' ? options.hotpepperLabel : options.unknownLabel);
    const row = map.get(source) ?? { newCustomers: 0, returned: 0, matureNewCustomers: 0, matureReturned: 0 };
    row.newCustomers += 1;
    if (c.returned) row.returned += 1;
    if (c.firstDate <= matureCutoff) {
      row.matureNewCustomers += 1;
      if (c.returned) row.matureReturned += 1;
    }
    map.set(source, row);
  }

  const orderOf = (source: string): number => {
    if (source === options.unknownLabel) return Number.MAX_SAFE_INTEGER;
    const i = options.sourceOrder.indexOf(source);
    return i === -1 ? options.sourceOrder.length : i;
  };

  return Array.from(map.entries())
    .map(([source, v]) => ({
      source,
      ...v,
      repeatRate: v.newCustomers > 0 ? v.returned / v.newCustomers : null,
      matureRepeatRate: v.matureNewCustomers > 0 ? v.matureReturned / v.matureNewCustomers : null,
    }))
    .sort((a, b) => orderOf(a.source) - orderOf(b.source) || a.source.localeCompare(b.source));
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
