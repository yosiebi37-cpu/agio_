import { describe, it, expect } from 'vitest';
import { pickSquareServiceForMenu } from './square-sync';

const items = [
  { name: 'カット', square_service_variation_id: 'SQ_CUT' },
  { name: 'カット＋カラー＋トリートメント', square_service_variation_id: 'SQ_CCT' },
  { name: '【歴20年以上】似合せカットシャンプー', square_service_variation_id: 'SQ_NIAWASE' },
  { name: '【カラー・パーマに追加】残留薬剤デトックストリートメントフル', square_service_variation_id: 'SQ_DETOX' },
  { name: 'ヘッドスパ', square_service_variation_id: null },
];

describe('pickSquareServiceForMenu', () => {
  it('uses an exact match first, even when the menu name itself contains ＋', () => {
    expect(pickSquareServiceForMenu('カット＋カラー＋トリートメント', items)).toBe('SQ_CCT');
  });

  it('uses the first menu of a multi-menu booking', () => {
    expect(
      pickSquareServiceForMenu('【歴20年以上】似合せカットシャンプー＋【カラー・パーマに追加】残留薬剤デトックストリートメントフル', items),
    ).toBe('SQ_NIAWASE');
  });

  it('prefers the longest matching first menu', () => {
    expect(pickSquareServiceForMenu('カット＋カラー＋トリートメント＋ヘッドスパ', items)).toBe('SQ_CCT');
  });

  it('returns null when the menu has no Square ID', () => {
    expect(pickSquareServiceForMenu('ヘッドスパ', items)).toBeNull();
  });

  it('returns null for an unknown menu', () => {
    expect(pickSquareServiceForMenu('通常', items)).toBeNull();
  });

  it('does not match a menu that only shares a prefix without the ＋ separator', () => {
    expect(pickSquareServiceForMenu('カットのみ', items)).toBeNull();
  });
});

describe('pickSquareServiceForMenu with LINE限定 / 一般 menus of the same name', () => {
  const dup = [
    { name: '【agio基本白髪染め】コンシャスリタッチカラー＋カット', square_service_variation_id: 'SQ_LINE', price: 8500 },
    { name: '【agio基本白髪染め】コンシャスリタッチカラー＋カット', square_service_variation_id: 'SQ_GENERAL', price: 9500 },
  ];

  it('picks the menu whose price matches the booking amount', () => {
    expect(pickSquareServiceForMenu('【agio基本白髪染め】コンシャスリタッチカラー＋カット', dup, 9500)).toBe('SQ_GENERAL');
    expect(pickSquareServiceForMenu('【agio基本白髪染め】コンシャスリタッチカラー＋カット', dup, 8500)).toBe('SQ_LINE');
  });

  it('falls back to the first one when no price matches', () => {
    expect(pickSquareServiceForMenu('【agio基本白髪染め】コンシャスリタッチカラー＋カット', dup, 7000)).toBe('SQ_LINE');
  });
});
