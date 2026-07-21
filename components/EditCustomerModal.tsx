'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { initialsFromName } from '@/lib/format';
import type { Customer, Staff, CustomerType } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  staff: Staff[];
}

export default function EditCustomerModal({ open, onClose, customer: c, staff }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(c.name);
  const [furigana, setFurigana] = useState(c.furigana ?? '');
  const [phone, setPhone] = useState(c.phone ?? '');
  const [birthYear, setBirthYear] = useState(c.birth_year ? String(c.birth_year) : '');
  const [customerType, setCustomerType] = useState<CustomerType>(c.customer_type);
  const [staffId, setStaffId] = useState(c.assigned_staff_id ?? '');
  const [hairType, setHairType] = useState(c.hair_type ?? '');
  const [allergyTag, setAllergyTag] = useState(c.allergy_tag ?? '');
  const [allergyNote, setAllergyNote] = useState(c.allergy_note ?? '');
  const [nextSuggestion, setNextSuggestion] = useState(c.next_suggestion ?? '');
  const [nextTarget, setNextTarget] = useState(c.next_target ?? '');
  const [nextPrice, setNextPrice] = useState(c.next_price ?? '');
  const [nextDuration, setNextDuration] = useState(c.next_duration ?? '');

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) {
      setError('お客様名を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb
        .from('customers')
        .update({
          name: name.trim(),
          furigana: furigana.trim() || null,
          initials: initialsFromName(name),
          phone: phone.trim() || null,
          birth_year: birthYear ? parseInt(birthYear, 10) : null,
          customer_type: customerType,
          assigned_staff_id: staffId || null,
          hair_type: hairType.trim() || null,
          allergy_tag: allergyTag.trim() || null,
          allergy_note: allergyNote.trim() || null,
          next_suggestion: nextSuggestion.trim() || null,
          next_target: nextTarget.trim() || null,
          next_price: nextPrice.trim() || null,
          next_duration: nextDuration.trim() || null,
        })
        .eq('id', c.id);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
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
          <div className="modal-title">顧客情報を編集</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="f-row f-name-group">
            <label className="f-label f-label-ruby">フリガナ</label>
            <input className="f-input f-input-ruby" type="text" placeholder="ヤマダ ハナコ" value={furigana} onChange={(e) => setFurigana(e.target.value)} />
            <label className="f-label">お客様名</label>
            <input className="f-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">電話番号</label>
              <input className="f-input" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="f-label">生まれ年</label>
              <input className="f-input" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">区分</label>
              <select className="f-select" value={customerType} onChange={(e) => setCustomerType(e.target.value as CustomerType)}>
                <option value="new">新規客</option>
                <option value="existing">既存客</option>
              </select>
            </div>
            <div>
              <label className="f-label">担当スタイリスト</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">未割当</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">髪質メモ</label>
            <input className="f-input" type="text" value={hairType} onChange={(e) => setHairType(e.target.value)} />
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">アレルギータグ</label>
              <input className="f-input" type="text" value={allergyTag} onChange={(e) => setAllergyTag(e.target.value)} />
            </div>
            <div>
              <label className="f-label">アレルギー補足</label>
              <input className="f-input" type="text" value={allergyNote} onChange={(e) => setAllergyNote(e.target.value)} />
            </div>
          </div>
          <div className="f-row" style={{ borderTop: '1px solid var(--sand)', paddingTop: 14 }}>
            <label className="f-label">次回おすすめ施術</label>
            <input className="f-input" type="text" value={nextSuggestion} onChange={(e) => setNextSuggestion(e.target.value)} />
          </div>
          <div className="f-row2" style={{ marginBottom: 0 }}>
            <div>
              <label className="f-label">次回目安時期</label>
              <input className="f-input" type="text" placeholder="6週間後" value={nextTarget} onChange={(e) => setNextTarget(e.target.value)} />
            </div>
            <div>
              <label className="f-label">想定金額</label>
              <input className="f-input" type="text" placeholder="¥12,000〜" value={nextPrice} onChange={(e) => setNextPrice(e.target.value)} />
            </div>
          </div>
          <div className="f-row" style={{ marginTop: 14, marginBottom: 0 }}>
            <label className="f-label">想定所要時間</label>
            <input className="f-input" type="text" placeholder="2時間" value={nextDuration} onChange={(e) => setNextDuration(e.target.value)} />
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
