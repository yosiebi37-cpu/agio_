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

/**
 * お客様名をそろえる（空白・全角/半角の違いだけを吸収）。
 * 「様」「さん」は消さない：「坂本様 恵子」と「坂本 恵子」のような別のお客様を同じ人と判断しないため
 */
export const normalizeName = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();

/** フリガナをそろえる（ひらがな→カタカナ、空白・半角カナの違いを吸収） */
export const normalizeKana = (s: string | null | undefined): string =>
  hiraganaToKatakana((s ?? '').normalize('NFKC')).replace(/[\s　]+/g, '');

/** 電話番号が「同じ」または「1桁だけ違う（入力ミス）」か。どちらかが未登録なら判断できないので true */
const phoneCompatible = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  if (pa.length < 10 || pb.length < 10) return true;
  if (pa.length !== pb.length) return false;
  let diff = 0;
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diff++;
  return diff <= 1;
};

/**
 * 名前が同じ人と言えるか。親子・ご家族で同じ電話番号を使っている場合に、
 * 電話番号だけで別の家族のカルテに紐付けないために使う。
 * 名字だけの登録（「鈴木」→「鈴木 由佳」）は同じ人とみなす
 */
const sameNameish = (c: MatchCandidate, name: string, kana: string): boolean => {
  const cn = normalizeName(c.name);
  if (cn && name && (cn === name || name.startsWith(cn) || cn.startsWith(name))) return true;
  const ck = normalizeKana(c.furigana);
  return !!kana && !!ck && ck === kana;
};

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
 * 優先順位: ① LINEユーザーID ② 電話番号（名前も合う人） ③ お名前（フリガナ・電話番号が矛盾しない人）
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
  const name = normalizeName(input.name);
  const kana = normalizeKana(input.furigana);

  // ② 電話番号：同じ番号でも、名前が違う場合（親子・ご家族の共有番号）は別の人として扱う
  if (phone.length >= 10) {
    const byPhone = candidates.filter((c) => normalizePhone(c.phone) === phone && sameNameish(c, name, kana));
    if (byPhone.length) return { customer: pickBest(byPhone), reason: 'phone' };
  }

  // ③ お名前：同じお名前で、フリガナが矛盾せず、電話番号も「未登録」か「1桁違い」までのときだけ同じ人とみなす
  //   （同姓同名の別のお客様を取り違えないため）
  if (name) {
    const byName = candidates.filter((c) => {
      if (normalizeName(c.name) !== name) return false;
      const cKana = normalizeKana(c.furigana);
      if (kana && cKana && cKana !== kana) return false;
      return phoneCompatible(c.phone, input.phone);
    });
    if (byName.length) return { customer: pickBest(byName), reason: 'name' };
  }

  return null;
}

/** 顧客一覧の中から「同じ人かもしれない」組を見つける（名前 or 電話番号が一致） */
export function findDuplicateIds(candidates: MatchCandidate[]): Set<string> {
  const dup = new Set<string>();
  const byName = new Map<string, MatchCandidate[]>();
  const byPhone = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    const name = normalizeName(c.name);
    // 「鈴木」「予約」のような名字だけ・メモ的な登録は誤検出が多いので2文字以下は対象外
    if (name.length >= 3) byName.set(name, [...(byName.get(name) ?? []), c]);
    const phone = normalizePhone(c.phone);
    if (phone.length >= 10) byPhone.set(phone, [...(byPhone.get(phone) ?? []), c]);
  }
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    // 同じ名前でも、フリガナも電話番号も違う場合は同姓同名の別人として扱う
    for (const a of list) {
      for (const b of list) {
        if (a.id === b.id) continue;
        const ka = normalizeKana(a.furigana);
        const kb = normalizeKana(b.furigana);
        const kanaOk = !ka || !kb || ka === kb;
        if (kanaOk || phoneCompatible(a.phone, b.phone)) { dup.add(a.id); dup.add(b.id); }
      }
    }
  }
  for (const list of byPhone.values()) {
    if (list.length < 2) continue;
    // 同じ電話番号でも名前が違う場合（親子・ご家族）は重複扱いしない
    for (const a of list) {
      for (const b of list) {
        if (a.id !== b.id && sameNameish(a, normalizeName(b.name), normalizeKana(b.furigana))) { dup.add(a.id); dup.add(b.id); }
      }
    }
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
    if (phone.length >= 10 && normalizePhone(c.phone) === phone && sameNameish(c, name, kana)) return true;
    if (kana.length >= 4 && normalizeKana(c.furigana) === kana) return true;
    return false;
  });
}
