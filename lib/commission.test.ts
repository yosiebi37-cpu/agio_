import { describe, it, expect } from 'vitest';
import { commissionKindOf } from './commission';

describe('commissionKindOf', () => {
  it('本人顧客をそのスタッフが担当 → own', () => {
    expect(commissionKindOf({ staff_id: 'a', customer: { own_client_staff_id: 'a' } })).toBe('own');
  });
  it('別スタッフの本人顧客を担当 → shop', () => {
    expect(commissionKindOf({ staff_id: 'b', customer: { own_client_staff_id: 'a' } })).toBe('shop');
  });
  it('agioのお客様（再来・指名含む） → shop', () => {
    expect(commissionKindOf({ staff_id: 'a', customer: { own_client_staff_id: null } })).toBe('shop');
  });
  it('顧客未登録（フリー） → shop', () => {
    expect(commissionKindOf({ staff_id: 'a', customer: null })).toBe('shop');
  });
  it('配列で返ってきた場合も判定できる', () => {
    expect(commissionKindOf({ staff_id: 'a', customer: [{ own_client_staff_id: 'a' }] })).toBe('own');
  });
});
