import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeName, normalizeKana, findMatchingCustomer, findDuplicateIds, findDuplicateCandidates } from './customer-match';

const base = [
  { id: 'a', name: '熊谷 美穂', furigana: 'クマガイ ミホ', phone: null, line_user_id: null, customer_type: 'existing' as const, visit_count: 3 },
  { id: 'b', name: '辻 桂一', furigana: 'ツジ ケイイチ', phone: '07015098282', line_user_id: null, customer_type: 'existing' as const, visit_count: 5 },
  { id: 'c', name: '嶋坂 悟', furigana: 'しまさか さとる', phone: null, line_user_id: null, customer_type: 'existing' as const, visit_count: 3 },
  { id: 'd', name: '山田 花子', furigana: 'ヤマダ ハナコ', phone: '090-1111-2222', line_user_id: 'U123', customer_type: 'new' as const, visit_count: 1 },
];

describe('normalize', () => {
  it('phone: ハイフン・全角・+81を吸収', () => {
    expect(normalizePhone('090-1111-2222')).toBe('09011112222');
    expect(normalizePhone('０９０１１１１２２２２')).toBe('09011112222');
    expect(normalizePhone('+81 90 1111 2222')).toBe('09011112222');
  });
  it('name: 空白・様を吸収', () => {
    expect(normalizeName('坂本様 恵子')).toBe(normalizeName('坂本恵子'));
    expect(normalizeName('熊谷　美穂 様')).toBe('熊谷美穂');
  });
  it('kana: ひらがな→カタカナ', () => {
    expect(normalizeKana('しまさか さとる')).toBe('シマサカサトル');
  });
});

describe('findMatchingCustomer', () => {
  it('LINEユーザーIDが最優先', () => {
    expect(findMatchingCustomer(base, { lineUserId: 'U123', phone: '000', name: '別名' })?.customer.id).toBe('d');
  });
  it('電話番号の書き方が違っても一致', () => {
    expect(findMatchingCustomer(base, { phone: '09011112222', name: '山田花子' })?.reason).toBe('phone');
  });
  it('電話未登録の既存客を名前で見つける（LINE予約の二重登録対策）', () => {
    const m = findMatchingCustomer(base, { phone: '09033163909', name: '熊谷 美穂', furigana: 'クマガイ ミホ' });
    expect(m?.customer.id).toBe('a');
    expect(m?.reason).toBe('name');
  });
  it('電話番号が1桁違っても名前とフリガナで見つける', () => {
    expect(findMatchingCustomer(base, { phone: '07012098282', name: '辻 桂一', furigana: 'ツジ ケイイチ' })?.customer.id).toBe('b');
  });
  it('フリガナがひらがな登録でも一致', () => {
    expect(findMatchingCustomer(base, { phone: '08000000000', name: '嶋坂 悟', furigana: 'シマサカ サトル' })?.customer.id).toBe('c');
  });
  it('同じ漢字でも読みが違えば別人', () => {
    expect(findMatchingCustomer(base, { phone: '08000000000', name: '辻 桂一', furigana: 'ツジ ケイジ' })).toBeNull();
  });
  it('初めてのお客様は null', () => {
    expect(findMatchingCustomer(base, { phone: '08099999999', name: '新井 太郎' })).toBeNull();
  });
});

describe('duplicates', () => {
  it('同名・同電話を重複候補にする', () => {
    const list = [...base, { id: 'e', name: '熊谷美穂', phone: '09033163909' }, { id: 'f', name: '鈴木' }, { id: 'g', name: '鈴木' }];
    const ids = findDuplicateIds(list);
    expect(ids.has('a') && ids.has('e')).toBe(true);
    expect(ids.has('f')).toBe(false);
    expect(findDuplicateCandidates(base[0], list).map((c) => c.id)).toEqual(['e']);
  });
});
