'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { TYPE_LABEL, TYPE_TAG_CLASS } from '@/lib/constants';
import { formatDateSlash } from '@/lib/format';
import { normalizePhone } from '@/lib/customer-match';
import type { Customer } from '@/lib/types';

export interface MergeCandidate {
  id: string;
  name: string;
  furigana: string | null;
  phone: string | null;
  customer_type: 'existing' | 'new';
  visit_count: number;
  last_visit_on: string | null;
  staff?: { name: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  candidates: MergeCandidate[];
}

// 予約・施術履歴などを付け替える対象（customer_id を持つテーブル）
const LINKED_TABLES = ['bookings', 'treatment_records', 'chemical_records', 'karte_photos', 'retail_sales'] as const;

// 空欄のときだけ、まとめる側のお客様の情報で補う項目
const FILL_FIELDS = [
  'furigana', 'phone', 'line_user_id', 'birth_year', 'birth_month', 'birth_day',
  'acquisition_source', 'hair_type', 'allergy_tag', 'allergy_note', 'assigned_staff_id',
  'own_client_staff_id', 'next_suggestion', 'next_target', 'next_price', 'next_duration',
] as const;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * 同じお客様が二重に登録されてしまったときに、1人分にまとめる。
 * 選んだ登録（重複側）の予約・施術履歴・薬剤記録・写真・物販を、いま開いているお客様に移してから、重複側を削除する。
 */
export default function MergeCustomerModal({ open, onClose, customer: c, candidates }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(candidates[0]?.id ?? '');
  const [phoneChoice, setPhoneChoice] = useState<'keep' | 'other'>('keep');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const selected = candidates.find((d) => d.id === selectedId) ?? null;
  const phonesDiffer =
    !!selected && !isBlank(c.phone) && !isBlank(selected.phone) && normalizePhone(c.phone) !== normalizePhone(selected.phone);

  const merge = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `「${selected.name} 様」（来店${selected.visit_count}回）の登録を、いま開いている「${c.name} 様」にまとめます。\n\n予約・施術履歴・薬剤記録・写真・物販はすべてこちらに移り、「${selected.name} 様」の登録は削除されます。\nよろしいですか？`,
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { data: dup, error: dupError } = await sb.from('customers').select('*').eq('id', selected.id).single();
      if (dupError || !dup) throw new Error(dupError?.message ?? 'まとめるお客様の情報が見つかりませんでした。');

      // ① 残すお客様の空欄を、重複側の情報で補う
      const patch: Record<string, unknown> = {};
      const cur = c as unknown as Record<string, unknown>;
      for (const f of FILL_FIELDS) {
        if (isBlank(cur[f]) && !isBlank(dup[f])) patch[f] = dup[f];
      }
      if (phonesDiffer && phoneChoice === 'other') patch.phone = dup.phone;
      if (c.customer_type === 'new' && dup.customer_type === 'existing') patch.customer_type = 'existing';
      const newOffset = (c.visit_count_offset ?? 0) + (dup.visit_count_offset ?? 0);
      if (newOffset !== (c.visit_count_offset ?? 0)) patch.visit_count_offset = newOffset;
      if (Object.keys(patch).length) {
        const { error: patchError } = await sb.from('customers').update(patch).eq('id', c.id);
        if (patchError) throw new Error(patchError.message);
      }

      // ② 予約・施術履歴などを、残すお客様に付け替える
      for (const table of LINKED_TABLES) {
        const { error: moveError } = await sb.from(table).update({ customer_id: c.id }).eq('customer_id', selected.id);
        if (moveError) throw new Error(`${table} の付け替えに失敗しました：${moveError.message}`);
      }

      // ③ 来店回数を数え直す（施術履歴の件数＋手動調整分）
      const { count } = await sb
        .from('treatment_records')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', c.id);
      await sb.from('customers').update({ visit_count: (count ?? 0) + newOffset }).eq('id', c.id);

      // ④ 中身が空になった重複側の登録を削除する
      const { error: deleteError } = await sb.from('customers').delete().eq('id', selected.id);
      if (deleteError) throw new Error(`重複側の登録の削除に失敗しました：${deleteError.message}`);

      setSaving(false);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">重複しているお客様をまとめる</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-m)', marginBottom: 12, lineHeight: 1.7 }}>
            同じお客様かもしれない登録です。まとめたい登録を選ぶと、その予約・施術履歴・写真などが
            <b>「{c.name} 様」</b>（いま開いているカルテ）に移り、選んだ登録は削除されます。
          </div>
          {candidates.map((d) => (
            <label
              key={d.id}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, marginBottom: 8, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${d.id === selectedId ? 'var(--accent)' : 'var(--sand)'}`,
              }}
            >
              <input type="radio" name="merge-target" checked={d.id === selectedId} onChange={() => { setSelectedId(d.id); setPhoneChoice('keep'); }} style={{ marginTop: 4 }} />
              <div style={{ fontSize: 14 }}>
                <div>
                  {d.name}{d.furigana && <span style={{ fontSize: 12, color: 'var(--ink-l)', marginLeft: 6 }}>{d.furigana}</span>}
                  <span className={`tag ${TYPE_TAG_CLASS[d.customer_type]}`} style={{ marginLeft: 8 }}>{TYPE_LABEL[d.customer_type]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-l)', marginTop: 2 }}>
                  電話 {d.phone ?? '未入力'} ・ 担当 {d.staff?.name ?? '—'} ・ 来店{d.visit_count}回 ・ 最終来店 {formatDateSlash(d.last_visit_on)}
                </div>
              </div>
            </label>
          ))}
          {phonesDiffer && selected && (
            <div className="f-row" style={{ marginTop: 6 }}>
              <label className="f-label">電話番号が違います。どちらを残しますか？</label>
              <select className="f-select" value={phoneChoice} onChange={(e) => setPhoneChoice(e.target.value as 'keep' | 'other')}>
                <option value="keep">{c.phone}（いま開いているカルテ）</option>
                <option value="other">{selected.phone}（{selected.name} 様の登録）</option>
              </select>
            </div>
          )}
          {error && <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={merge} disabled={saving || !selected}>
            {saving ? 'まとめています…' : 'こちらにまとめる'}
          </button>
        </div>
      </div>
    </div>
  );
}
