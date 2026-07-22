'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { STAFF_PALETTE } from '@/lib/constants';
import type { EmploymentType } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  nextSortOrder: number;
}

export default function NewStaffModal({ open, onClose, nextSortOrder }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('staff');
  const [paletteIndex, setPaletteIndex] = useState(0);

  if (!open) return null;

  const reset = () => {
    setName('');
    setInitials('');
    setEmploymentType('staff');
    setPaletteIndex(0);
  };

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
      const { error } = await sb.from('staff').insert({
        name: name.trim(),
        initials: initials.trim().slice(0, 3).toUpperCase(),
        employment_type: employmentType,
        color: p.color,
        bg_color: p.bg,
        fg_color: p.fg,
        sort_order: nextSortOrder,
      });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      reset();
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
          <div className="modal-title">スタッフを新規登録</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">お名前</label>
              <input className="f-input" type="text" placeholder="田中 京子" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="f-label">イニシャル</label>
              <input className="f-input" type="text" placeholder="TK" value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={3} />
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">区分</label>
            <select className="f-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
              <option value="staff">社員（スタッフ）</option>
              <option value="contract">業務委託</option>
            </select>
          </div>
          <div className="f-row" style={{ marginBottom: 0 }}>
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
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '登録中…' : 'スタッフを登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
