'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { initialsFromName } from '@/lib/format';
import type { Staff, CustomerType } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  staff: Staff[];
}

export default function NewCustomerModal({ open, onClose, staff }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('new');
  const [staffId, setStaffId] = useState('');
  const [hairType, setHairType] = useState('');
  const [allergyTag, setAllergyTag] = useState('');
  const [allergyNote, setAllergyNote] = useState('');

  if (!open) return null;

  const reset = () => {
    setName('');
    setFurigana('');
    setPhone('');
    setBirthYear('');
    setCustomerType('new');
    setStaffId('');
    setHairType('');
    setAllergyTag('');
    setAllergyNote('');
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('お客様名を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { data, error } = await sb
        .from('customers')
        .insert({
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
        })
        .select('id')
        .single();
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      reset();
      onClose();
      router.push(`/karte/${data.id}`);
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
          <div className="modal-title">顧客を新規登録</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">お客様名</label>
              <input className="f-input" type="text" placeholder="山田 花子" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="f-label">フリガナ</label>
              <input className="f-input" type="text" placeholder="ヤマダ ハナコ" value={furigana} onChange={(e) => setFurigana(e.target.value)} />
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">電話番号</label>
              <input className="f-input" type="text" placeholder="090-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="f-label">生まれ年</label>
              <input className="f-input" type="number" placeholder="1990" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
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
            <input className="f-input" type="text" placeholder="細毛・くせ毛など" value={hairType} onChange={(e) => setHairType(e.target.value)} />
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">アレルギータグ</label>
              <input className="f-input" type="text" placeholder="ジアミンアレルギー歴" value={allergyTag} onChange={(e) => setAllergyTag(e.target.value)} />
            </div>
            <div>
              <label className="f-label">アレルギー補足</label>
              <input className="f-input" type="text" value={allergyNote} onChange={(e) => setAllergyNote(e.target.value)} />
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 14, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '登録中…' : '顧客を登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
