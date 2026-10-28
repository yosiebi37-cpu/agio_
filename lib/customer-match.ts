// お客様の「同一人物」判定。
// LINE予約・ホットペッパー連携・予約ボードなど、どこから予約が入っても
// 既存のお客様に正しく紐付けて、顧客管理に同じ人が二重登録されないようにする。

import { hiraganaToKatakana } from './format';

export interface MatchCandidate {
  id: string;
  name: string;
  furigana?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
  customer_type?: 'existing' | 'new';
  visit_count?: number | null;
}

/** 電話番号を数字だけにそろえる（ハイフン・空白・全角数字・+81 の違いを吸収） */
export const normalizePhone = (s: string | null | undefined): string => {
  let digits = (s ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '');
  if (digits.startsWith('81') && digits.length >= 11) digits = '0' + digits.slice(2);
  return digits;
};

/** お客様名をそろえる（空白・「様」「さん」の有無、全角/半角の違いを吸収） */
export const normalizeName = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/(様|さま|さん)$/u, '')
    .replace(/様/gu, '')
    .toLowerCase();

/** フリガナをそろえる（ひらがな→カタカナ、空白・半角カナの違いを吸収） */
export const normalizeKana = (s: string | null | undefined): string =>
  hiraganaToKatakana((s ?? '').normalize('NFKC')).replace(/[\s　]+/g, '');

/** 候補が複数あるときは、既存客 → 来店回数が多い人 を優先する */
const pickBest = <T extends MatchCandidate>(list: T[]): T =>
  [...list].sort((a, b) => {
    const typeScore = (c: MatchCandidate) => (c.customer_type === 'existing' ? 1 : 0);
    if (typeScore(b) !== typeScore(a)) return typeScore(b) - typeScore(a);
    return (b.visit_count ?? 0) - (a.visit_count ?? 0);
  })[0];

export type MatchReason = 'line' | 'phone' | 'name';

/**
 * 予約者の情報から、すでに登録済みのお客様を探す。
 * 優先順位: ① LINEユーザーID ② 電話番号 ③ お名前（フリガナが両方ある場合は一致も確認）
 * 見つからなければ null（＝本当に初めてのお客様）。
 */
export function findMatchingCustomer<T extends MatchCandidate>(
  candidates: T[],
  input: { lineUserId?: string | null; phone?: string | null; name: string; furigana?: string | null },
): { customer: T; reason: MatchReason } | null {
  if (input.lineUserId) {
    const byLine = candidates.filter((c) => c.line_user_id && c.line_user_id === input.lineUserId);
    if (byLine.length) return { customer: pickBest(byLine), reason: 'line' };
  }

  const phone = normalizePhone(input.phone);
  if (phone.length >= 10) {
    const byPhone = candidates.filter((c) => normalizePhone(c.phone) === phone);
    if (byPhone.length) return { customer: pickBest(byPhone), reason: 'phone' };
  }

  const name = normalizeName(input.name);
  if (name) {
    const kana = normalizeKana(input.furigana);
    const byName = candidates.filter((c) => {
      if (normalizeName(c.name) !== name) return false;
      const cKana = normalizeKana(c.furigana);
      // 同じ漢字でも読みが明らかに違う場合（別人）は除外する。どちらかのフリガナが空なら名前だけで判断
      return !kana || !cKana || cKana === kana;
    });
    if (byName.length) return { customer: pickBest(byName), reason: 'name' };
  }

  return null;
}

/** 顧客一覧の中から「同じ人かもしれない」組を見つける（名前 or 電話番号が一致） */
export function findDuplicateIds(candidates: MatchCandidate[]): Set<string> {
  const groups = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  };
  for (const c of candidates) {
    const name = normalizeName(c.name);
    // 「鈴木」「予約」のような名字だけ・メモ的な登録は誤検出が多いので2文字以下は対象外
    if (name.length >= 3) add(`n:${name}`, c.id);
    const phone = normalizePhone(c.phone);
    if (phone.length >= 10) add(`p:${phone}`, c.id);
  }
  const dup = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length > 1) ids.forEach((id) => dup.add(id));
  }
  return dup;
}

/** あるお客様と同じ人かもしれない候補（統合の候補として表示する） */
export function findDuplicateCandidates<T extends MatchCandidate>(target: MatchCandidate, all: T[]): T[] {
  const name = normalizeName(target.name);
  const phone = normalizePhone(target.phone);
  const kana = normalizeKana(target.furigana);
  return all.filter((c) => {
    if (c.id === target.id) return false;
    if (name && normalizeName(c.name) === name) return true;
    if (phone.length >= 10 && normalizePhone(c.phone) === phone) return true;
    if (kana.length >= 4 && normalizeKana(c.furigana) === kana) return true;
    return false;
  });
}
