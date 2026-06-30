'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import type { Staff } from '@/lib/types';

const AVATAR_COLORS = [
  { bg: '#E8F0ED', fg: '#2C4A3E' },
  { bg: '#FAF4E6', fg: '#8A6A1A' },
  { bg: '#F0EBF8', fg: '#5A3D8A' },
  { bg: '#E8F5F0', fg: '#1A6B4A' },
  { bg: '#F5F0E8', fg: '#4A4540' },
];

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0].slice(0, 1) + parts[1].slice(0, 1);
  return name.slice(0, 2);
}

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
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [customerType, setCustomerType] = useState<'existing' | 'new'>('new');
  const [staffId, setStaffId] = useState('');
  const [hairType, setHairType] = useState('');
  const [allergyTag, setAllergyTag] = useState('');
  const [allergyNote, setAllergyNote] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  if (!open) return null;

  const reset = () => {
    setName(''); setPhone(''); setBirthYear(''); setCustomerType('new');
    setStaffId(''); setHairType(''); setAllergyTag(''); setAllergyNote('');
    setColorIdx(0); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!name.trim()) { setError('お客様名を入力してください。'); return; }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const color = AVATAR_COLORS[colorIdx];
      const { error: err } = await sb.from('customers').insert({
        name: name.trim(),
        initials: makeInitials(name),
        phone: phone.trim() || null,
        birth_year: birthYear ? parseInt(birthYear, 10) : null,
        customer_type: customerType,
        hair_type: hairType.trim() || null,
        allergy_tag: allergyTag.trim() || null,
        allergy_note: allergyNote.trim() || null,
        avatar_bg: color.bg,
        avatar_fg: color.fg,
        assigned_staff_id: staffId || null,
        visit_count: 0,
        lifetime_value: 0,
      });
      if (err) { setError(err.message); setSaving(false); return; }
      setSaving(false);
      handleClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg open" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <div className="modal-title">新規顧客登録</div>
          <button className="mclose" onClick={handleClose}><i className="ti ti-x"></i></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* アバターカラー選択 */}
          <div className="f-row">
            <label className="f-label">アバターカラー</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AVATAR_COLORS.map((c, i) => (
                <div
                  key={i}
                  onClick={() => setColorIdx(i)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: c.bg, color: c.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    border: colorIdx === i ? `2px solid ${c.fg}` : '2px solid transparent',
                  }}
                >
                  {name ? makeInitials(name) : 'A'}
                </div>
              ))}
            </div>
          </div>

          {/* 基本情報 */}
          <div className="f-row">
            <label className="f-label">お客様名 <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="f-input" type="text" placeholder="例: 海老原 花子" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="f-row2">
            <div>
              <label className="f-label">電話番号</label>
              <input className="f-input" type="tel" placeholder="090-0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="f-label">生年</label>
              <input className="f-input" type="number" placeholder="1990" min="1940" max="2010" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
            </div>
          </div>

          <div className="f-row2">
            <div>
              <label className="f-label">区分</label>
              <select className="f-select" value={customerType} onChange={(e) => setCustomerType(e.target.value as 'existing' | 'new')}>
                <option value="new">新規客</option>
                <option value="existing">既存客</option>
              </select>
            </div>
            <div>
              <label className="f-label">担当スタイリスト</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">未定</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* 髪質 */}
          <div className="f-row">
            <label className="f-label">髪質メモ</label>
            <input className="f-input" type="text" placeholder="例: 細め・軟毛・多毛 / パサつきあり" value={hairType} onChange={(e) => setHairType(e.target.value)} />
          </div>

          {/* アレルギー */}
          <div className="f-row">
            <label className="f-label">アレルギー</label>
            <input className="f-input" type="text" placeholder="例: ジアミンアレルギー歴" value={allergyTag} onChange={(e) => setAllergyTag(e.target.value)} />
          </div>
          {allergyTag && (
            <div className="f-row" style={{ marginTop: -6 }}>
              <label className="f-label">アレルギー補足</label>
              <input className="f-input" type="text" placeholder="例: パッチテスト必須" value={allergyNote} onChange={(e) => setAllergyNote(e.target.value)} />
            </div>
          )}

          {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={handleClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '登録中…' : '顧客を登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
