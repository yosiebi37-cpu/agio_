import type { BookingStatus, CustomerType, MenuItem } from './types';

// メニュー未登録時や menu_items が読み込めない場合に使う予備の一覧
export const FALLBACK_MENUS: MenuItem[] = [
  { id: 'fallback-1', name: 'カット', price: 5500, sort_order: 1, is_active: true, created_at: '' },
  { id: 'fallback-2', name: 'カット + カラー', price: 12100, sort_order: 2, is_active: true, created_at: '' },
  { id: 'fallback-3', name: 'ハイライトカラー', price: 16500, sort_order: 3, is_active: true, created_at: '' },
  { id: 'fallback-4', name: 'グレイカラー', price: 8800, sort_order: 4, is_active: true, created_at: '' },
  { id: 'fallback-5', name: 'フルカラー', price: 8800, sort_order: 5, is_active: true, created_at: '' },
  { id: 'fallback-6', name: 'デジタルパーマ', price: 17600, sort_order: 6, is_active: true, created_at: '' },
  { id: 'fallback-7', name: '縮毛矯正', price: 22000, sort_order: 7, is_active: true, created_at: '' },
  { id: 'fallback-8', name: 'トリートメント', price: 4400, sort_order: 8, is_active: true, created_at: '' },
];

// 予約ボードのレイアウト定数（スタッフ = 行、時刻 = 列）
export const OPEN_HOUR = 9; // 開店（先頭の時刻ラベル）
export const ROW_COUNT = 11; // 表示する時間枠の数（9:00〜20:00）
export const HOUR_W = 120; // 1時間あたりの幅(px)
export const STAFF_COL_W = 190; // スタッフ名 列（固定表示）の幅(px)
export const HOURS: number[] = Array.from({ length: ROW_COUNT }, (_, i) => OPEN_HOUR + i);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  visited: '来店済',
  confirmed: '確定',
  tentative: '仮予約',
};

// 予約ブロック右上のステータスドット色
export const STATUS_DOT: Record<BookingStatus, string> = {
  visited: '#a8e6c4',
  confirmed: '#FFD580',
  tentative: 'rgba(255,255,255,0.4)',
};

// タグ用クラス
export const STATUS_TAG_CLASS: Record<BookingStatus, string> = {
  visited: 'tag-ok',
  confirmed: 'tag-pend',
  tentative: 'tag-done',
};

export const TYPE_LABEL: Record<CustomerType, string> = {
  existing: '既存客',
  new: '新規客',
};

export const TYPE_TAG_CLASS: Record<CustomerType, string> = {
  existing: 'tag-ok',
  new: 'tag-new',
};

// スタッフ登録フォームの配色プリセット（予約ボードで担当ごとに見分けるため）
export const STAFF_PALETTE: { color: string; bg: string; fg: string }[] = [
  { color: '#2C4A3E', bg: '#E8F0ED', fg: '#2C4A3E' },
  { color: '#C9A84C', bg: '#FAF4E6', fg: '#8A6A1A' },
  { color: '#7B5EA7', bg: '#F0EBF8', fg: '#5A3D8A' },
  { color: '#2C7A4E', bg: '#E8F5F0', fg: '#1A6B4A' },
  { color: '#4A4540', bg: '#F5F0E8', fg: '#4A4540' },
  { color: '#4A6B5C', bg: '#E5EDE9', fg: '#4A6B5C' },
  { color: '#A15C4A', bg: '#F3E6E1', fg: '#A15C4A' },
  { color: '#3D6B8A', bg: '#E5EEF3', fg: '#3D6B8A' },
];
