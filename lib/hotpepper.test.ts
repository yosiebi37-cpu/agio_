import { describe, it, expect } from 'vitest';
import { classifyHotpepperSubject, parseReservationId, parseHotpepperBookingEmail } from './hotpepper';

const BOOKING_EMAIL = `agio×arocoffee（旧：agio hair&spa）様

HOT PEPPER Beauty「SALON BOARD」にお客様から
ご予約が入りました。

◇ご予約内容
■予約番号
　BF60526961
■氏名
　中野 賢樹（ナカノ サトキ）
■来店日時
　2026年09月01日（火）12:00
■スタイリスト
　フリー
■メニュー
　カット＋トリートメント
　（メニュー金額：8,800円）
　（施術時間目安：1時間30分）
■ご利用クーポン
　[新規]
　カット+デトックストリートメント
■合計金額
　予約時合計金額　8,800円
`;

describe('classifyHotpepperSubject', () => {
  it('detects cancellation subjects', () => {
    expect(classifyHotpepperSubject('キャンセル連絡')).toBe('cancel');
    expect(classifyHotpepperSubject('【明日】キャンセル連絡')).toBe('cancel');
  });
  it('detects booking subjects', () => {
    expect(classifyHotpepperSubject('予約連絡')).toBe('booking');
    expect(classifyHotpepperSubject('【当日】予約連絡')).toBe('booking');
    expect(classifyHotpepperSubject('【ポイント利用明日】予約連絡')).toBe('booking');
    expect(classifyHotpepperSubject('【当日00時00分】直前予約が入りました')).toBe('booking');
  });
  it('returns null for unrelated subjects', () => {
    expect(classifyHotpepperSubject('お知らせ')).toBeNull();
  });
});

describe('parseReservationId', () => {
  it('extracts the reservation id', () => {
    expect(parseReservationId(BOOKING_EMAIL)).toBe('BF60526961');
  });
  it('returns null when missing', () => {
    expect(parseReservationId('本文なし')).toBeNull();
  });
});

describe('parseHotpepperBookingEmail', () => {
  it('extracts all fields from a real booking email', () => {
    expect(parseHotpepperBookingEmail(BOOKING_EMAIL)).toEqual({
      reservationId: 'BF60526961',
      customerName: '中野 賢樹',
      furigana: 'ナカノ サトキ',
      date: '2026-09-01',
      startTime: '12:00',
      stylistName: 'フリー',
      menuName: 'カット＋トリートメント',
      price: 8800,
      durationMinutes: 90,
    });
  });
  it('returns null when the reservation id is missing', () => {
    expect(parseHotpepperBookingEmail('関係のない本文')).toBeNull();
  });
});
