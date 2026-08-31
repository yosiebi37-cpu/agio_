'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { STAFF_PALETTE } from '@/lib/constants';
import type { EmploymentType, Staff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  staffMember: Staff;
}

function closestPaletteIndex(color: string): number {
  const i = STAFF_PALETTE.findIndex((p) => p.color.toLowerCase() === color.toLowerCase());
  return i === -1 ? 0 : i;
}

export default function EditStaffModal({ open, onClose, staffMember: s }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(s.name);
  const [initials, setInitials] = useState(s.initials);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(s.employment_type);
  const [paletteIndex, setPaletteIndex] = useState(closestPaletteIndex(s.color));
  const [isActive, setIsActive] = useState(s.is_active);
  const [userId, setUserId] = useState(s.user_id ?? '');

  if (!open) return null;

  const submit = async () => {
    if (!name.trim() || !initials.trim()) {
      setError('お名前とイニシャルを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const p = STAFF_PALETTE[paletteIndex];
      const { error } = await sb
        .from('staff')
        .update({
          name: name.trim(),
          initials: initials.trim().slice(0, 3).toUpperCase(),
          employment_type: employmentType,
          color: p.color,
          bg_color: p.bg,
          fg_color: p.fg,
          is_active: isActive,
          user_id: userId.trim() || null,
        })
        .eq('id', s.id);
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
          <div className="modal-title">スタッフ情報を編集</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">お名前</label>
              <input className="f-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="f-label">イニシャル</label>
              <input className="f-input" type="text" value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={3} />
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">区分</label>
            <select className="f-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
              <option value="staff">社員（スタッフ）</option>
              <option value="contract">業務委託</option>
            </select>
          </div>
          <div className="f-row">
            <label className="f-label">カラー</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STAFF_PALETTE.map((p, i) => (
                <div
                  key={i}
                  onClick={() => setPaletteIndex(i)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: p.color,
                    cursor: 'pointer',
                    border: i === paletteIndex ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: i === paletteIndex ? '0 0 0 2px var(--cream)' : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <label className="f-check">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            在籍中（予約ボードに表示する）
          </label>
          <div className="f-row" style={{ marginBottom: 0 }}>
            <label className="f-label">ログイン用ユーザーID（任意）</label>
            <input
              className="f-input"
              type="text"
              placeholder="Supabaseで発行したユーザーIDを貼り付け"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 4 }}>
              スタッフ本人にログインしてもらう場合、Supabaseの「Authentication → Users」でこの人用のアカウントを作り、そのUser UIDをここに貼り付けてください。空欄のままなら通常のオーナー権限のログインとして扱われます。
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
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
