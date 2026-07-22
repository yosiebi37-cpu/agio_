'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { toISODate, addDays, datesInRangeByWeekday } from '@/lib/format';
import type { Staff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  staff: Staff[];
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function ShiftBulkModal({ open, onClose, staff }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('19:00');
  const [rangeStart, setRangeStart] = useState(() => toISODate(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() => addDays(toISODate(new Date()), 84));

  if (!open) return null;

  const toggleWeekday = (w: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  };

  const submit = async () => {
    if (!staffId) {
      setError('スタッフを選択してください。');
      return;
    }
    if (weekdays.size === 0) {
      setError('曜日を1つ以上選択してください。');
      return;
    }
    if (start >= end) {
      setError('終了時間は開始時間より後にしてください。');
      return;
    }
    if (rangeStart > rangeEnd) {
      setError('開始日は終了日より前にしてください。');
      return;
    }

    setSaving(true);
    setError(null);
    setResult(null);

    const rows = datesInRangeByWeekday(rangeStart, rangeEnd, weekdays).map((shift_date) => ({
      staff_id: staffId,
      shift_date,
      start_time: start,
      end_time: end,
    }));

    if (rows.length === 0) {
      setSaving(false);
      setError('指定した期間に該当する日がありません。');
      return;
    }

    try {
      const sb = getBrowserSupabase();
      const { error } = await sb.from('shifts').upsert(rows, { onConflict: 'staff_id,shift_date' });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setResult(`${rows.length}日分のシフトを設定しました。`);
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
          <div className="modal-title">シフトを曜日でまとめて設定</div>
          <button className="mclose" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="f-row">
            <label className="f-label">スタッフ</label>
            <select className="f-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="f-row">
            <label className="f-label">曜日（複数選択可）</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAY.map((w, i) => (
                <div
                  key={i}
                  onClick={() => toggleWeekday(i)}
                  className={`staff-chip${weekdays.has(i) ? ' on' : ''}`}
                  style={weekdays.has(i) ? { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' } : undefined}
                >
                  {w}
                </div>
              ))}
            </div>
          </div>
          <div className="f-row2">
            <div>
              <label className="f-label">開始時間</label>
              <input className="f-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="f-label">終了時間</label>
              <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="f-row2" style={{ marginBottom: 0 }}>
            <div>
              <label className="f-label">適用期間（開始日）</label>
              <input className="f-input" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div>
              <label className="f-label">適用期間（終了日）</label>
              <input className="f-input" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
          </div>
          {error && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--red)' }}>{error}</div>
          )}
          {result && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--green)' }}>{result}</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>閉じる</button>
          <button className="btn-save" onClick={submit} disabled={saving}>
            {saving ? '設定中…' : 'まとめて設定する'}
          </button>
        </div>
      </div>
    </div>
  );
}
