'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatDateLong } from '@/lib/format';
import type { Shift } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  date: string;
  existingShift: Shift | null;
}

export default function ShiftEditModal({ open, onClose, staffId, staffName, date, existingShift }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(existingShift ? existingShift.start_time.slice(0, 5) : '10:00');
  const [end, setEnd] = useState(existingShift ? existingShift.end_time.slice(0, 5) : '19:00');

  if (!open) return null;

  const submit = async () => {
    if (start >= end) {
      setError('終了時間は開始時間より後にしてください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb
        .from('shifts')
        .upsert(
          { staff_id: staffId, shift_date: date, start_time: start, end_time: end },
          { onConflict: 'staff_id,shift_date' },
        );
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

  const clearShift = async () => {
    setSaving(true);
    setError(null);
    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('shifts').delete().eq('staff_id', staffId).eq('shift_date', date);
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
          <div className="modal-title">シフトを設定</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">スタッフ / 日付</label>
            <div style={{ fontSize: 14, color: 'var(--ink)' }}>{staffName} ・ {formatDateLong(date)}</div>
          </div>
          <div className="f-row2" style={{ marginBottom: 0 }}>
            <div>
              <label className="f-label">開始時間</label>
              <input className="f-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="f-label">終了時間</label>
              <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-foot">
          {existingShift && (
            <button className="btn-cancel" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={clearShift} disabled={saving}>
              休みにする
            </button>
          )}
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
