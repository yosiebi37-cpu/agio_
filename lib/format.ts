// 表示用フォーマッタ

/** 1234500 -> "¥1,234,500" */
export const yen = (n: number | null | undefined): string =>
  '¥' + (n ?? 0).toLocaleString('ja-JP');

/** 336000 -> "¥336k" */
export const yenK = (n: number | null | undefined): string =>
  '¥' + Math.round((n ?? 0) / 1000) + 'k';

/** 'HH:MM:SS' / 'HH:MM' -> 'HH:MM' */
export const hhmm = (t: string): string => t.slice(0, 5);

/** 'HH:MM(:SS)' -> 0 時からの経過分 */
export const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' -> "5月30日（土）" */
export const formatDateShort = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY[d.getDay()]}）`;
};

/** 'YYYY-MM-DD' -> "2026年5月30日（土）" */
export const formatDateLong = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY[d.getDay()]}）`;
};

/** 'YYYY-MM-DD' -> "2026/05/30" */
export const formatDateSlash = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd}`;
};

/** Date -> 'YYYY-MM-DD' */
export const toISODate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** 'YYYY-MM' -> "2026年7月" */
export const formatMonthLong = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
};

/** 'YYYY-MM-DD' -> "5/30(土)" */
export const formatDateTiny = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
};

/** "山田 花子" -> "山花"、区切りが無ければ先頭2文字 */
export const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.trim().slice(0, 2);
};
