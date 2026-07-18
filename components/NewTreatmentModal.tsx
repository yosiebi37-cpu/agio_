'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate } from '@/lib/format';
import type { Staff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string;
  staff: Staff[];
}

export default function NewTreatmentModal({ open, onClose, customerId, staff }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [performedOn, setPerformedOn] = useState(() => toISODate(new Date()));
  const [staffId, setStaffId] = useState('');
  const [menu, setMenu] = useState('');
  const [amount, setAmount] = useState('8800');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');

  if (!open) return null;

  const reset = () => {
    setPerformedOn(toISODate(new Date()));
    setStaffId('');
    setMenu('');
    setAmount('8800');
    setTags('');
    setNote('');
  };

  const submit = async () => {
    if (!menu.trim()) {
      setError('メニューを入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('treatment_records').insert({
        customer_id: customerId,
        staff_id: staffId || null,
        performed_on: performedOn,
        menu: menu.trim(),
        amount: parseInt(amount, 10) || 0,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        note: note.trim() || null,
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
          <div className="modal-title">施術記録を追加</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row2">
            <div>
              <label className="f-label">施術日</label>
              <input className="f-input" type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
            </div>
            <div>
              <label className="f-label">担当スタイリスト</label>
              <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">未指定</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="f-row">
            <label className="f-label">メニュー</label>
            <input className="f-input" type="text" placeholder="カット + カラー" value={menu} onChange={(e) => setMenu(e.target.value)} />
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">金額 (円)</label>
              <input className="f-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="f-label">タグ（カンマ区切り）</label>
              <input className="f-input" type="text" placeholder="縮毛矯正, トリートメント" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          <div className="f-row" style={{ marginBottom: 0 }}>
            <label className="f-label">メモ</label>
            <textarea className="f-input f-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '記録を追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
